/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BioFresh-CV Main Frontend Application
 * 
 * In simple words:
 * This is the interactive React app where users can:
 * 1. Snap or upload a photo of fresh produce (avocado, mango, banana, tomato, apple, greens, etc.)
 * 2. Get instant AI freshness scoring & remaining useful life (in hours and days)
 * 3. Track nutrient retention & get zero-waste recipe suggestions
 * 4. Save and review previous scans in their history archive
 */

import React, { useState, useRef, useEffect } from 'react';
import { Camera, History as HistoryIcon, Leaf, Thermometer, Droplets, Info, ChevronRight, X, Loader2, RefreshCw, LogIn, LogOut, User as UserIcon, Bell, ThumbsUp, ThumbsDown, AlertTriangle, MapPin, Lock, Unlock, Clock, Trash2, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth, loginWithGoogle, checkRedirectLogin, loginAnonymously } from './lib/firebase';
import { savePrediction, getHistory, updatePrediction, deletePrediction, PredictionHistoryItem, compressImageThumbnail } from './services/history';
import { predictProduce, fetchWeather, sendFeedback, getModelInfo, DEFAULT_WEATHER, PredictionResult, WeatherData } from './services/api';
import { calculateDecayRate, calculateRUL, getNutrientRetention, getFreshnessLabel, NutrientDetail, PRODUCE_DATA } from './lib/science';
import { getRecommendations, Recipe } from './lib/recipes';
import { RAGKnowledgeAdvisor } from './components/RAGKnowledgeAdvisor';
import { HowItWorks } from './components/HowItWorks';
import { AIAssistant } from './components/AIAssistant';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, Legend } from 'recharts';

// Words that mean the photo is not a fruit/vegetable when a user types a correction
const NON_PRODUCE_WORDS = new Set([
  'human', 'person', 'people', 'man', 'woman', 'men', 'women', 'boy', 'girl', 'child', 'kid', 'baby',
  'me', 'myself', 'selfie', 'face', 'hand', 'body', 'student', 'friend',
  'dog', 'cat', 'animal', 'pet', 'bird', 'car', 'bike', 'phone', 'laptop', 'book', 'bottle', 'cup',
  'table', 'chair', 'room', 'wall', 'object', 'nothing', 'not', 'none',
]);

// Every produce type the app has shelf-life data for, for the "pick the right item" dropdown
const KNOWN_PRODUCE = Object.keys(PRODUCE_DATA).sort();
// "34 days" when there is time, "12 hours" when it is urgent (shelf life isn't precise to 0.1 h)
const formatShelfLife = (hours: number) =>
  hours >= 48 ? `${Math.round(hours / 24)} days` : `${Math.max(0, Math.round(hours))} ${Math.round(hours) === 1 ? 'hour' : 'hours'}`;
const prettyName = (id: string) => id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/** Guess whether a typed label is produce: "human" or "my face" -> false, "kiwi" -> true. */
function looksLikeProduce(label: string): boolean {
  return !label.split('_').some(word => NON_PRODUCE_WORDS.has(word));
}

/**
 * LocationSelectorModal
 * 
 * Modal popup that lets the user:
 * 1. Type their city/address OR auto-detect their GPS location.
 * 2. Select where the produce is stored:
 *    - Room Temp (~20°C indoor)
 *    - Outside (ambient outdoor weather)
 *    - Refrigerator (custom cold temperature slider, e.g. 4°C)
 */
function LocationSelectorModal({ onClose, onSelect }: { 
  onClose: () => void, 
  onSelect: (lat: number, lng: number, name: string, storageEnv: 'room' | 'outside' | 'refrigerator', fridgeTempC?: number) => void 
}) {
  // Local state for the typed address or city
  const [address, setAddress] = useState(() => {
    return localStorage.getItem('biofresh_location_name') || '';
  });

  // GPS coordinates (latitude and longitude)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const lat = localStorage.getItem('biofresh_lat');
    const lon = localStorage.getItem('biofresh_lon');
    return (lat && lon) ? { lat: parseFloat(lat), lng: parseFloat(lon) } : null;
  });

  // Where is the fruit/veggie kept: 'room', 'outside', or 'refrigerator'
  const [storageEnv, setStorageEnv] = useState<'room' | 'outside' | 'refrigerator'>(() => {
    return (localStorage.getItem('biofresh_storage_env') as any) || 'room';
  });

  // If in refrigerator, what temperature is it set to? (Default: 4°C)
  const [fridgeTempC, setFridgeTempC] = useState<number>(() => {
    const saved = localStorage.getItem('biofresh_fridge_temp');
    return saved ? parseFloat(saved) : 4;
  });

  // Status flags for the auto-detect GPS button
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

  /**
   * handleAutoDetect
   * 
   * Reads current GPS coordinates from the browser using navigator.geolocation
   * and translates coordinates into a readable city name using reverse geocoding.
   */
  const handleAutoDetect = () => {
    setDetecting(true);
    setDetectError(null);
    setDetectMsg(null);

    if (!navigator.geolocation) {
      setDetectError("Geolocation is not supported by your device browser.");
      setDetecting(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        setDetecting(false);
        setDetectMsg("✓ Location successfully detected!");

        try {
          // Ask OpenStreetMap Nominatim for the readable city/town name
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
            headers: { 'User-Agent': 'BioFresh-CV/1.0' }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.display_name) {
              const parts = data.display_name.split(',');
              const shortName = parts.slice(0, 3).join(',').trim();
              setAddress(shortName || `Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}`);
            } else {
              setAddress(`Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}`);
            }
          } else {
            setAddress(`Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}`);
          }
        } catch {
          setAddress(`Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}`);
        }
      },
      (err) => {
        console.warn("GPS detection failed", err);
        setDetectError("Device GPS access denied or timed out. Please type your location address.");
        setDetecting(false);
      },
      { timeout: 8000 }
    );
  };

  /**
   * handleConfirm
   * 
   * If the user typed a new city or address, geocode it to coordinates,
   * then pass the location and storage conditions back to the parent app.
   */
  const handleConfirm = async () => {
    let finalLat = coords?.lat || 12.97;
    let finalLng = coords?.lng || 77.59;
    const cleanAddress = address.trim();

    // If user typed a custom city name, look up its latitude & longitude
    if (cleanAddress && (!coords || address !== `Lat: ${coords.lat.toFixed(4)}, Lon: ${coords.lng.toFixed(4)}`)) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddress)}`, {
          headers: { 'User-Agent': 'BioFresh-CV/1.0' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            finalLat = parseFloat(data[0].lat);
            finalLng = parseFloat(data[0].lon);
          }
        }
      } catch (e) {
        console.warn("Address geocoding error", e);
      }
    }

    const finalName = cleanAddress || `Lat: ${finalLat.toFixed(2)}, Lon: ${finalLng.toFixed(2)}`;
    onSelect(finalLat, finalLng, finalName, storageEnv, storageEnv === 'refrigerator' ? fridgeTempC : undefined);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-4xl flex flex-col overflow-hidden max-h-[90vh] shadow-2xl"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Location & Storage Environment</h3>
            <p className="text-[11px] text-slate-500 font-medium">Configure location and produce storage conditions</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Section 1: Location Input & Auto-detect */}
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              1. Location (City or Text Address)
            </label>
            
            <div className="relative">
              <input 
                type="text" 
                placeholder="Enter address, city, or zip code..." 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#0097B2]/20 focus:border-[#0097B2] outline-none transition-all text-sm font-medium text-slate-800"
              />
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            </div>

            <button
              onClick={handleAutoDetect}
              disabled={detecting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#0097B2]/5 hover:bg-[#0097B2]/10 border border-[#0097B2]/20 rounded-2xl text-[#0097B2] font-bold text-xs transition-all"
            >
              {detecting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span>Accessing Device Location...</span>
                </>
              ) : (
                <>
                  <MapPin size={16} fill="currentColor" />
                  <span>📍 Auto-detect Device Location</span>
                </>
              )}
            </button>

            {detectMsg && (
              <p className="text-xs text-[#1AAB5F] font-bold text-center">{detectMsg}</p>
            )}
            {detectError && (
              <p className="text-xs text-rose-500 font-medium text-center">{detectError}</p>
            )}
          </div>

          <div className="border-t border-slate-100 my-2" />

          {/* Section 2: Storage Environment */}
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              2. Storage Condition
            </label>
            <p className="text-xs text-slate-600 font-medium">Is this produce kept in room temperature, outside, or in a refrigerator?</p>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStorageEnv('room')}
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center ${
                  storageEnv === 'room'
                    ? 'border-[#0097B2] bg-[#0097B2]/10 text-[#0097B2] font-bold ring-2 ring-[#0097B2]/20'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-xl">🏠</span>
                <span className="text-xs font-bold leading-tight">Room Temp</span>
                <span className="text-[10px] text-slate-500">~20°C / Indoor</span>
              </button>

              <button
                type="button"
                onClick={() => setStorageEnv('outside')}
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center ${
                  storageEnv === 'outside'
                    ? 'border-[#0097B2] bg-[#0097B2]/10 text-[#0097B2] font-bold ring-2 ring-[#0097B2]/20'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-xl">☀️</span>
                <span className="text-xs font-bold leading-tight">Outside</span>
                <span className="text-[10px] text-slate-500">Ambient Weather</span>
              </button>

              <button
                type="button"
                onClick={() => setStorageEnv('refrigerator')}
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center ${
                  storageEnv === 'refrigerator'
                    ? 'border-[#0097B2] bg-[#0097B2]/10 text-[#0097B2] font-bold ring-2 ring-[#0097B2]/20'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="text-xl">❄️</span>
                <span className="text-xs font-bold leading-tight">Refrigerator</span>
                <span className="text-[10px] text-slate-500">Cold Storage</span>
              </button>
            </div>
          </div>

          {/* Section 3: If Refrigerator is selected, ask refrigerator temperature */}
          {storageEnv === 'refrigerator' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-4 bg-sky-50 border border-sky-200/60 rounded-3xl space-y-3"
            >
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                  <span>❄️</span> Refrigerator Temperature
                </label>
                <span className="text-xs font-bold bg-sky-600 text-white px-2.5 py-0.5 rounded-full">
                  {fridgeTempC}°C ({((fridgeTempC * 9/5) + 32).toFixed(0)}°F)
                </span>
              </div>

              <p className="text-[11px] text-sky-700">Select or enter your refrigerator temperature:</p>

              {/* Temperature presets */}
              <div className="grid grid-cols-4 gap-1.5">
                {[2, 4, 6, 8].map(temp => (
                  <button
                    key={temp}
                    type="button"
                    onClick={() => setFridgeTempC(temp)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold transition-all ${
                      fridgeTempC === temp 
                        ? 'bg-sky-600 text-white shadow-sm' 
                        : 'bg-white text-sky-800 border border-sky-200 hover:bg-sky-100'
                    }`}
                  >
                    {temp}°C {temp === 4 ? '(Ideal)' : ''}
                  </button>
                ))}
              </div>

              {/* Temperature slider */}
              <div className="pt-2">
                <input 
                  type="range" 
                  min="0" 
                  max="10" 
                  step="0.5"
                  value={fridgeTempC}
                  onChange={(e) => setFridgeTempC(parseFloat(e.target.value))}
                  className="w-full h-2 bg-sky-200 rounded-lg appearance-none cursor-pointer accent-sky-600"
                />
                <div className="flex justify-between text-[10px] font-bold text-sky-500 mt-1">
                  <span>0°C (Freezing)</span>
                  <span>5°C (Standard)</span>
                  <span>10°C (Mild)</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 font-bold text-slate-500 hover:text-slate-700 transition-colors text-sm"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            className="flex-[2] py-3 bg-[#0097B2] text-white rounded-2xl font-bold shadow-lg shadow-cyan-100 hover:bg-[#007a90] transition-all text-sm"
          >
            Confirm Details
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * App (Main Root Component)
 * 
 * Coordinates the entire state, views, camera stream, AI predictions, and history.
 */
export default function App() {
  // Navigation screen view: 'home' | 'scanner' | 'result' | 'history'
  const [view, setView] = useState<'home' | 'scanner' | 'result' | 'history'>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // User Authentication State
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  
  // Active Produce Prediction Data
  const [currentImage, setCurrentImage] = useState<string | null>(null); // Base64 picture
  const [prediction, setPrediction] = useState<PredictionResult | null>(null); // AI output
  const [weather, setWeather] = useState<WeatherData | null>(null); // Environmental conditions
  const [rul, setRul] = useState<number | null>(null); // Remaining shelf life in hours
  const [nutrients, setNutrients] = useState<{ weightG: number; nutrients: NutrientDetail[] } | null>(null); // Estimated vitamins
  const [recipes, setRecipes] = useState<Recipe[]>([]); // Zero-waste recipes
  const [lastSavedId, setLastSavedId] = useState<string | null>(null); // Firestore doc ID
  const [feedbackState, setFeedbackState] = useState<'none' | 'correct' | 'incorrect'>('none');
  const [showCorrection, setShowCorrection] = useState(false);
  const [produceTypeCount, setProduceTypeCount] = useState<number | null>(null); // from the trained model
  useEffect(() => {
    getModelInfo().then(i => setProduceTypeCount(i.labels ? i.labels.classes.filter(c => c !== 'not_produce').length : null)).catch(() => {});
  }, []);
  const [customLabel, setCustomLabel] = useState(''); // free-text answer to "what is it?"
  const [feedbackSaveState, setFeedbackSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  // False when the model decided the photo is not a fruit/vegetable (e.g. a person)
  const isProduce = prediction?.is_produce !== false;
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState<number>(12); // Alert when 12h left
  const [showThresholdPicker, setShowThresholdPicker] = useState(false);
  const [resultActiveTab, setResultActiveTab] = useState<'overview' | 'ai' | 'how'>('overview');
  
  // Environment State (Saved location, temperature, and moisture)
  const [homeWeather, setHomeWeather] = useState<WeatherData | null>(() => {
    const saved = localStorage.getItem('biofresh_last_weather');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLocationLocked, setIsLocationLocked] = useState(() => {
    return localStorage.getItem('biofresh_location_locked') === 'true';
  });
  const [locationName, setLocationName] = useState<string>(() => {
    return localStorage.getItem('biofresh_location_name') || 'Set your location';
  });
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [tempLatLon, setTempLatLon] = useState<{lat: number, lng: number} | null>(null);
  
  // History State
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<PredictionHistoryItem | null>(null);
  
  // HTML Refs for Camera feed, Canvas screenshot, and File upload
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // --- Lifecycle Effects ---

  /**
   * Listen for user login state changes and handle mobile redirect results.
   */
  useEffect(() => {
    // Check if user just completed a mobile redirect
    checkRedirectLogin().then((redirectUser) => {
      if (redirectUser) {
        setUser(redirectUser);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
      } else {
        setUser(null);
        // Try anonymous guest session if enabled in Firebase Console, otherwise stay as local guest
        try {
          const guestUser = await loginAnonymously();
          if (guestUser) {
            setUser(guestUser);
          }
        } catch {
          // Ignored
        }
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  /**
   * When auth state is ready or changes:
   * 1. Load scan history (from Firestore if logged in, or local storage if guest).
   * 2. Refresh local ambient weather using saved coordinates.
   */
  useEffect(() => {
    if (authReady) {
      loadHistory();
      
      const savedLat = localStorage.getItem('biofresh_lat');
      const savedLon = localStorage.getItem('biofresh_lon');
      const savedName = localStorage.getItem('biofresh_location_name');
      const savedWeather = localStorage.getItem('biofresh_last_weather');

      if (savedLat && savedLon) {
        // Refresh weather silently for saved coords on load
        fetchWeather(parseFloat(savedLat), parseFloat(savedLon))
          .then(data => {
            setHomeWeather(data);
            const friendlyName = data.location_name || savedName || `Lat: ${parseFloat(savedLat).toFixed(2)}, Lon: ${parseFloat(savedLon).toFixed(2)}`;
            setLocationName(friendlyName);
            localStorage.setItem('biofresh_location_name', friendlyName);
            localStorage.setItem('biofresh_last_weather', JSON.stringify(data));
          })
          .catch(err => {
            console.warn("Failed to refresh saved weather on load", err);
          });
      } else if (savedWeather && savedName) {
        try {
          setHomeWeather(JSON.parse(savedWeather));
          setLocationName(savedName);
        } catch {
          setLocationName('Set your location');
        }
      } else {
        setLocationName('Set your location');
      }
    }
  }, [user, authReady]);

  /**
   * Automatically refresh history whenever the user opens the History tab
   */
  useEffect(() => {
    if (view === 'history' && user) {
      loadHistory();
    }
  }, [view, user]);

  // --- Action Handlers ---

  /**
   * fetchHomeEnvironment
   * 
   * Asks the browser for device GPS location and fetches current weather telemetry.
   */
  const fetchHomeEnvironment = async () => {
    try {
      const pos: any = await new Promise((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      );
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      
      const weatherData = await fetchWeather(lat, lon);
      setHomeWeather(weatherData);
      
      const friendlyName = weatherData.location_name || `Lat: ${lat.toFixed(2)}, Lon: ${lon.toFixed(2)}`;
      setLocationName(friendlyName);
      
      localStorage.setItem('biofresh_location_name', friendlyName);
      localStorage.setItem('biofresh_last_weather', JSON.stringify(weatherData));
    } catch (err) {
      console.warn("Home environment fetch failed", err);
      setLocationName('Location Unavailable');
    }
  };

  /**
   * toggleLocationLock
   * 
   * Pin or unpin the current location so it doesn't get overwritten automatically.
   */
  const toggleLocationLock = () => {
    const newState = !isLocationLocked;
    setIsLocationLocked(newState);
    localStorage.setItem('biofresh_location_locked', newState.toString());
  };

  /**
   * handleManualLocation
   * 
   * Updates coordinates, storage condition ('room', 'outside', or 'refrigerator'),
   * and calculates the effective temperature in Kelvin for accurate Arrhenius shelf life math.
   */
  const handleManualLocation = async (
    lat: number, 
    lng: number, 
    name?: string, 
    storageEnv: 'room' | 'outside' | 'refrigerator' = 'room',
    fridgeTempC?: number
  ) => {
    try {
      const weatherData = await fetchWeather(lat, lng);
      
      let effectiveTempK = weatherData.temperature_kelvin;
      let envLabel = '';

      if (storageEnv === 'refrigerator') {
        const tempC = fridgeTempC !== undefined ? fridgeTempC : 4;
        effectiveTempK = tempC + 273.15;
        envLabel = ` (Fridge @ ${tempC}°C)`;
        localStorage.setItem('biofresh_storage_env', 'refrigerator');
        localStorage.setItem('biofresh_fridge_temp', tempC.toString());
      } else if (storageEnv === 'room') {
        effectiveTempK = 293.15; // 20°C standard room temperature
        envLabel = ' (Room Temp)';
        localStorage.setItem('biofresh_storage_env', 'room');
      } else {
        envLabel = ' (Outside)';
        localStorage.setItem('biofresh_storage_env', 'outside');
      }

      const updatedWeather = {
        ...weatherData,
        temperature_kelvin: effectiveTempK
      };

      setHomeWeather(updatedWeather);
      const friendlyName = (name || weatherData.location_name || `Lat: ${lat.toFixed(2)}, Lon: ${lng.toFixed(2)}`) + envLabel;
      setLocationName(friendlyName);
      localStorage.setItem('biofresh_location_name', friendlyName);
      localStorage.setItem('biofresh_last_weather', JSON.stringify(updatedWeather));
      localStorage.setItem('biofresh_lat', lat.toString());
      localStorage.setItem('biofresh_lon', lng.toString());
      setShowLocationModal(false);
    } catch (err) {
      setError("Failed to fetch environment telemetry for selected location");
    }
  };

  /**
   * loadHistory
   * 
   * Fetches the user's latest 20 scans from Firestore to display in the History tab.
   */
  const loadHistory = async () => {
    setFetchingHistory(true);
    try {
      const data = await getHistory(20);
      setHistory(data);
    } catch (err) {
      console.error("Failed to load history", err);
    } finally {
      setFetchingHistory(false);
    }
  };

  /**
   * handleLogin
   * 
   * Triggers Google Sign-In popup with account selection.
   */
  const handleLogin = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.warn("Google login error:", err);
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        return;
      }
      if (err.code === 'auth/unauthorized-domain') {
        setError("This domain is not in Firebase's Authorized Domains list. Please add it in Firebase Console -> Authentication -> Settings.");
      } else if (err.code === 'auth/popup-blocked') {
        setError("Sign-in popup was blocked by your browser. Please allow popups for this site.");
      } else {
        setError(err.message || "Google Sign-In failed. Please try again.");
      }
    } finally {
      setLoggingIn(false);
    }
  };

  /**
   * handleLogout
   * 
   * Signs the user out cleanly and reloads scan history.
   */
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      reset();
      loadHistory();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  /**
   * stopScanner
   * 
   * Turns off the camera stream to save battery and release device camera hardware.
   */
  const stopScanner = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  /**
   * startScanner
   * 
   * Switches to the scanner screen and prompts for camera access.
   */
  const startScanner = async () => {
    setError(null);
    setCameraError(null);
    setView('scanner');
  };

  /**
   * Camera stream lifecycle effect
   * Turns on the webcam/back-camera when entering 'scanner' view, and turns it off when leaving.
   */
  useEffect(() => {
    let activeTracks: MediaStreamTrack[] = [];
    let isCancelled = false;

    if (view === 'scanner') {
      const startCamera = async () => {
        try {
          let stream: MediaStream;
          try {
            // Prefer back camera on mobile phones ('environment')
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'environment' } }
            });
          } catch {
            // Fallback to any default camera (like desktop webcam)
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          }

          if (isCancelled) {
            stream.getTracks().forEach(t => t.stop());
            return;
          }

          activeTracks = stream.getTracks();
          setCameraStream(stream);

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.muted = true;
            try {
              await videoRef.current.play();
            } catch (playErr) {
              console.warn("Video play promise error:", playErr);
            }
          }
        } catch (err: any) {
          console.error("Camera access error:", err);
          if (!isCancelled) {
            setCameraError("Camera permission blocked or unavailable in iframe. Use 'Upload Photo' to select an image!");
          }
        }
      };

      startCamera();
    } else {
      setCameraStream(null);
    }

    return () => {
      isCancelled = true;
      activeTracks.forEach(track => track.stop());
    };
  }, [view]);

  /**
   * Connect cameraStream to videoRef whenever cameraStream state updates
   */
  useEffect(() => {
    if (view === 'scanner' && videoRef.current && cameraStream) {
      const v = videoRef.current;
      v.srcObject = cameraStream;
      v.muted = true;
      v.play().catch(e => console.warn("Video play error:", e));
    }
  }, [view, cameraStream]);

  /**
   * processImageAndPredict
   * 
   * The core pipeline:
   * 1. Send picture to Gemini AI Vision Model
   * 2. Fetch local temperature and humidity
   * 3. Run Arrhenius Equation (calculate decay rate k, shelf life RUL in hours, vitamins)
   * 4. Look up zero-waste recipes if near expiry
   * 5. Save the scan result to Firestore database
   */
  const processImageAndPredict = async (originalImage: string) => {
    setLoading(true);
    setError(null);
    stopScanner();
    // Phone photos can be 10+ MB; the model only needs 224x224, so shrink to max 1024px first.
    // (Falls back to the original if the browser can't decode it.)
    const imageData = (await compressImageThumbnail(originalImage, 1024, 0.9)) || originalImage;
    setCurrentImage(imageData);

    try {
      // 1. Get Lat/Lon coordinates for ambient weather
      let lat: number | null = null, lon: number | null = null;
      const savedLat = localStorage.getItem('biofresh_lat');
      const savedLon = localStorage.getItem('biofresh_lon');
      
      if (savedLat && savedLon) {
        lat = parseFloat(savedLat);
        lon = parseFloat(savedLon);
      } else {
        try {
          const pos: any = await new Promise((res, rej) => 
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
          );
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } catch (e) {
          console.warn("Geolocation unavailable, using standard room conditions");
        }
      }

      // 2. Parallel API calls (Predict produce with our trained model + Fetch Weather with Open-Meteo)
      const [predResult, weatherResult] = await Promise.all([
        predictProduce(imageData),
        // Without a location, don't query the weather for lat 0 / lon 0 (the middle of the Atlantic)
        lat !== null && lon !== null ? fetchWeather(lat, lon) : Promise.resolve(DEFAULT_WEATHER)
      ]);

      // 3. Arrhenius Engine Logic with Storage Environment adjustment
      const storageEnv = localStorage.getItem('biofresh_storage_env') || 'room';
      const fridgeTempC = parseFloat(localStorage.getItem('biofresh_fridge_temp') || '4');
      
      let effectiveTempK = weatherResult.temperature_kelvin;
      if (storageEnv === 'refrigerator') {
        effectiveTempK = fridgeTempC + 273.15;
      } else if (storageEnv === 'room') {
        effectiveTempK = 293.15; // 20°C standard indoor room temperature
      }

      const effectiveWeather = {
        ...weatherResult,
        temperature_kelvin: effectiveTempK
      };

      setPrediction(predResult);
      setWeather(effectiveWeather);
      setFeedbackState('none');
      setShowCorrection(false);
      setCustomLabel('');
      setFeedbackSaveState('idle');

      if (predResult.is_produce === false) {
        // Not a fruit/vegetable: skip the shelf-life maths and history, just ask for feedback
        setRul(0);
        setNutrients(null);
        setRecipes([]);
        setLastSavedId(null);
        setView('result');
        return;
      }

      // Run Arrhenius kinetics equation: k = A * exp(-Ea / RT)
      const k = calculateDecayRate(predResult.produce_type, effectiveTempK);
      const calculatedRul = calculateRUL(predResult.quality_score, k);
      
      setRul(calculatedRul);
      const calculatedNutrients = getNutrientRetention(predResult.produce_type, predResult.quality_score);
      setNutrients(calculatedNutrients);
      setRecipes(getRecommendations(predResult.produce_type, calculatedRul));
      
      // 4. Save to Firestore
      const newScanItem: PredictionHistoryItem = {
        userId: user?.uid || '',
        produceType: predResult.produce_type,
        qualityScore: predResult.quality_score,
        rulHours: calculatedRul,
        temperatureK: effectiveTempK,
        humidity: weatherResult.humidity_percent,
        imageUrl: imageData,
        timestamp: new Date(),
        isCorrect: true,
      };

      const savedId = await savePrediction({
        produceType: predResult.produce_type,
        qualityScore: predResult.quality_score,
        rulHours: calculatedRul,
        temperatureK: effectiveTempK,
        humidity: weatherResult.humidity_percent,
        imageUrl: imageData,
        isCorrect: true
      });

      if (savedId) {
        setLastSavedId(savedId);
        newScanItem.id = savedId;
      }

      // Prepend to local history state immediately so user sees it without delay
      setHistory(prev => [newScanItem, ...prev.filter(p => p.id !== savedId)]);
      
      // Refresh scan list from server
      loadHistory();

      setView('result');
    } catch (err: any) {
      setError(err.message || "Failed to analyze produce image");
      setView('home');
    } finally {
      setLoading(false);
    }
  };

  /**
   * captureAndPredict
   * 
   * Takes a snapshot from the live camera canvas and sends it to the prediction pipeline.
   */
  const captureAndPredict = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = canvas.toDataURL('image/jpeg', 0.85);
      await processImageAndPredict(imageData);
    }
  };

  /**
   * handleFileUpload
   * 
   * Reads an uploaded image file (JPEG/PNG) from disk and sends it to the prediction pipeline.
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again later
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        await processImageAndPredict(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  /**
   * triggerFileUpload
   * 
   * Opens the file picker dialog.
   */
  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  /**
   * reset
   * 
   * Clears current scan and navigates back to the Home dashboard.
   */
  const reset = () => {
    stopScanner();
    setView('home');
    setPrediction(null);
    setWeather(null);
    setRul(null);
    setNutrients(null);
    setRecipes([]);
    setCurrentImage(null);
    setError(null);
    setSelectedHistoryItem(null);
    setLastSavedId(null);
    setFeedbackState('none');
    setAlertEnabled(false);
    setShowCorrection(false);
    setCustomLabel('');
    setFeedbackSaveState('idle');
  };

  /**
   * handleFeedback
   * 
   * When user clicks "Looks Correct" or "Wrong Produce", this verifies or opens alternative suggestions.
   */
  const handleFeedback = async (correct: boolean) => {
    setFeedbackState(correct ? 'correct' : 'incorrect');
    if (!correct) {
      setShowCorrection(true);
    } else {
      setShowCorrection(false);
      submitFeedback(true, prediction?.produce_type, isProduce);
      if (lastSavedId) {
        await updatePrediction(lastSavedId, { isCorrect: true }).catch(err => console.warn("Update prediction failed:", err));
      }
    }
  };

  /**
   * submitFeedback
   *
   * Sends the answer to "Is this correct?" to the server, which remembers the photo so that
   * similar photos get the right name next time (and uses it when the model is retrained).
   */
  const submitFeedback = async (correct: boolean, label: string | undefined, labelIsProduce: boolean) => {
    if (!prediction || !currentImage) return;
    setFeedbackSaveState('saving');
    try {
      const result = await sendFeedback(currentImage, prediction.produce_type, correct, label, labelIsProduce);
      const name = result.label === 'not_produce' ? 'not a fruit or vegetable' : result.label.replace(/_/g, ' ');
      setFeedbackSaveState('saved');
      setFeedbackMessage(correct
        ? 'Thanks! Saved as correct.'
        : `Thanks! Similar photos will be recognised as "${name}"${labelIsProduce || result.label === 'not_produce' ? '' : ' (not a fruit or vegetable)'} from now on.`);
    } catch (err: any) {
      setFeedbackSaveState('error');
      setFeedbackMessage(err.message || 'Could not save feedback');
    }
  };

  /**
   * handleCorrection
   * 
   * If the AI confused lookalike items (e.g. Avocado vs Mango), the user selects the right one here.
   * We instantly re-run the Arrhenius math, update vitamins & recipes, and update Firestore!
   */
  const handleCorrection = async (rawType: string, labelIsProduce?: boolean) => {
    if (!prediction || !weather) return;
    // Typed names like "Dragon Fruit" become "dragon_fruit" (same format as the model's classes)
    const newType = rawType.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!newType) return;
    // The user chose explicitly (button), otherwise guess from the name ("human" -> not produce)
    const produce = newType !== 'not_produce' && (labelIsProduce ?? looksLikeProduce(newType));

    // Teach the server what this photo really shows (used for future scans + retraining)
    submitFeedback(false, newType, produce);

    if (!produce) {
      // Not food (e.g. "human"): no shelf life, nutrients or recipes
      setPrediction({ ...prediction, produce_type: newType, is_produce: false, quality_score: 0, confidence_score: 1.0, source: 'model' });
      setRul(0);
      setNutrients(null);
      setRecipes([]);
      setShowCorrection(false);
      setFeedbackState('correct');
      // The scan that was saved to history was not produce, so remove it
      if (lastSavedId) {
        deletePrediction(lastSavedId).catch(e => console.warn("Firestore delete error:", e));
        setLastSavedId(null);
      }
      return;
    }

    // If the model thought it was not produce, it has no freshness reading: assume fresh (0.8)
    const wasProduce = prediction.is_produce !== false;
    const quality = wasProduce ? prediction.quality_score : 0.8;

    // Recalculate Arrhenius decay and RUL based on newly verified produce type
    const k = calculateDecayRate(newType, weather.temperature_kelvin);
    const calculatedRul = calculateRUL(quality, k);
    const calculatedNutrients = getNutrientRetention(newType, quality);

    // Update local state immediately
    setPrediction({
      ...prediction,
      produce_type: newType,
      is_produce: true,
      quality_score: quality,
      freshness_reliable: wasProduce ? prediction.freshness_reliable : false,
      confidence_score: 1.0
    });
    setRul(calculatedRul);
    setNutrients(calculatedNutrients);
    setRecipes(getRecommendations(newType, calculatedRul));
    setShowCorrection(false);
    setFeedbackState('correct');

    // Sync correction with Firestore
    if (lastSavedId) {
      try {
        await updatePrediction(lastSavedId, { 
          produceType: newType,
          isCorrect: false,
          correctedType: newType,
          rulHours: calculatedRul
        });
      } catch (e) {
        console.warn("Firestore update error:", e);
      }
    } else {
      try {
        const savedId = await savePrediction({
          produceType: newType,
          qualityScore: quality,
          rulHours: calculatedRul,
          temperatureK: weather.temperature_kelvin,
          humidity: weather.humidity_percent,
          imageUrl: currentImage || undefined,
          isCorrect: false,
          correctedType: newType
        });
        if (savedId) setLastSavedId(savedId);
      } catch (e) {
        console.warn("Firestore save error:", e);
      }
    }
  };

  /**
   * toggleAlert
   * 
   * Turns expiration reminder notifications on or off for the current scan.
   */
  const toggleAlert = async () => {
    const newState = !alertEnabled;
    setAlertEnabled(newState);
    // Update the local list too, so the home screen's "Active Freshness Alerts" shows it right away
    setHistory(prev => prev.map(h => h.id === lastSavedId
      ? { ...h, alertEnabled: newState, alertThreshold: newState ? alertThreshold : undefined }
      : h));
    if (lastSavedId) {
      await updatePrediction(lastSavedId, { 
        alertEnabled: newState,
        alertThreshold: newState ? alertThreshold : undefined
      });
    }
  };

  /**
   * applyAgentReminder
   *
   * The Kitchen Rescue Agent (Agentic AI) asked for an expiry reminder on one of the user's items:
   * turn the alert on locally and in Firestore.
   */
  const applyAgentReminder = (itemId: string, hoursBeforeExpiry: number) => {
    setHistory(prev => prev.map(h => h.id === itemId ? { ...h, alertEnabled: true, alertThreshold: hoursBeforeExpiry } : h));
    if (itemId === lastSavedId) {
      setAlertEnabled(true);
      setAlertThreshold(hoursBeforeExpiry);
    }
    updatePrediction(itemId, { alertEnabled: true, alertThreshold: hoursBeforeExpiry })
      .catch(err => console.warn("Could not save agent reminder:", err));
  };

  /**
   * updateAlertThreshold
   * 
   * Changes how many hours before expiration the alert should fire (e.g., 6h, 12h, 24h).
   */
  const updateAlertThreshold = async (val: number) => {
    setAlertThreshold(val);
    setHistory(prev => prev.map(h => h.id === lastSavedId && alertEnabled ? { ...h, alertThreshold: val } : h));
    if (lastSavedId && alertEnabled) {
      await updatePrediction(lastSavedId, { alertThreshold: val });
    }
  };

  /**
   * openHistoryItem
   * 
   * Opens the full details modal for a past scan clicked in the history list.
   */
  const openHistoryItem = (item: PredictionHistoryItem) => {
    setSelectedHistoryItem(item);
  };

  /**
   * toggleHistoryAlert
   * 
   * Toggles alert setting on a saved past scan inside the History modal.
   */
  const toggleHistoryAlert = async (item: PredictionHistoryItem) => {
    if (!item.id) return;
    const newState = !item.alertEnabled;
    const updated = { 
      ...item, 
      alertEnabled: newState, 
      alertThreshold: newState ? (item.alertThreshold || 12) : undefined 
    };
    setSelectedHistoryItem(updated);
    
    // Update main list
    setHistory(prev => prev.map(h => h.id === item.id ? updated : h));
    
    await updatePrediction(item.id, { 
      alertEnabled: newState,
      alertThreshold: newState ? (item.alertThreshold || 12) : undefined
    });
  };

  /**
   * updateHistoryAlertThreshold
   * 
   * Updates alert threshold on a saved past scan inside the History modal.
   */
  const updateHistoryAlertThreshold = async (item: PredictionHistoryItem, val: number) => {
    if (!item.id) return;
    const updated = { ...item, alertThreshold: val };
    setSelectedHistoryItem(updated);
    
    // Update main list
    setHistory(prev => prev.map(h => h.id === item.id ? updated : h));
    
    await updatePrediction(item.id, { alertThreshold: val });
  };

  /**
   * handleDeleteHistoryItem
   * 
   * Deletes a scan record from Firestore and removes it from the local list.
   */
  const handleDeleteHistoryItem = async (item: PredictionHistoryItem) => {
    if (!item.id) return;
    try {
      await deletePrediction(item.id);
      setHistory(prev => prev.filter(h => h.id !== item.id));
      setSelectedHistoryItem(null);
    } catch (e) {
      console.warn("Delete history item failed:", e);
    }
  };

  // How much longer the scanned item would last at 4°C (Arrhenius engine), shown on the result card
  const fridgeGainLabel = (() => {
    if (!prediction || rul === null) return '';
    if ((localStorage.getItem('biofresh_storage_env') || 'room') === 'refrigerator') return 'Already ✓';
    if (rul < 1) return '–';
    const fridgeRul = calculateRUL(prediction.quality_score, calculateDecayRate(prediction.produce_type, 277.15));
    const gainDays = (fridgeRul - rul) / 24;
    return gainDays >= 1 ? `+${Math.round(gainDays)} days` : gainDays * 24 >= 1 ? `+${Math.round(gainDays * 24)} h` : 'No gain';
  })();
  const expiringSoonCount = history.filter(h => {
    const scanned = h.timestamp instanceof Date ? h.timestamp.getTime() : new Date(h.timestamp).getTime();
    const left = h.rulHours - (Date.now() - scanned) / 3_600_000;
    return left > 0 && left < 24;
  }).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-teal-100 pb-36">
      {/* Header */}
        <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-md mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
              <div className="w-8 h-8 rounded-lg bg-[#1AAB5F] flex items-center justify-center text-white shadow-lg shadow-green-200">
                <Leaf size={18} fill="currentColor" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-800">BioFresh<span className="text-[#0097B2]">CV</span></h1>
            </div>
            
            <div className="flex items-center gap-2">
              {user && !user.isAnonymous ? (
                <div className="flex items-center gap-2">
                  {user.photoURL ? (
                    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden group relative flex-shrink-0 cursor-pointer" title={`Signed in as ${user.displayName || user.email}`}>
                      <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />
                      <button 
                        onClick={handleLogout}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                        title="Sign Out"
                      >
                        <LogOut size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-slate-100 pl-2.5 pr-1.5 py-1 rounded-full border border-slate-200">
                      <span className="text-xs font-bold text-slate-700 max-w-[90px] truncate">
                        {user.displayName || user.email?.split('@')[0] || 'User'}
                      </span>
                      <button 
                        onClick={handleLogout}
                        className="p-1 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                        title="Sign Out"
                      >
                        <LogOut size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleLogin}
                    disabled={loggingIn}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm px-3 py-1.5 rounded-full transition-all active:scale-95"
                    title="Sign in with Google Account"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>{loggingIn ? 'Connecting...' : 'Google Login'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className={`mx-auto pt-24 px-6 ${view === 'result' ? 'max-w-md lg:max-w-5xl' : 'max-w-md'}`}>
          <AnimatePresence mode="wait">
            {view === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="space-y-3">
                  <h2 className="text-3xl font-extrabold leading-tight">Predict Freshness. <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">Reduce Waste.</span></h2>
                  <p className="text-slate-600 leading-relaxed">Snap a fruit or vegetable to see how long it will stay fresh. A trained AI model recognises it, and storage-temperature science predicts its shelf life.</p>
                </div>

                {/* Environment Display */}
                <div 
                  onClick={() => setShowLocationModal(true)}
                  className="bg-white rounded-4xl p-5 border border-slate-100 shadow-sm flex items-center justify-between transition-all cursor-pointer hover:border-[#0097B2]/30 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#0097B2]/10 text-[#0097B2] flex items-center justify-center">
                      <MapPin size={22} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{locationName}</h4>
                      <div className="flex items-center gap-2">
                        {homeWeather ? (
                          <>
                            <span className="text-xs font-bold text-[#1AAB5F]">{(homeWeather.temperature_kelvin - 273.15).toFixed(1)}°C</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-xs font-bold text-[#0097B2]">{homeWeather.humidity_percent}% humidity</span>
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-slate-500">Tap to use local weather</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLocationLock();
                    }}
                    className={`flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all ${
                      isLocationLocked ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {isLocationLocked ? <Lock size={18} /> : <Unlock size={18} />}
                    <span className="text-[10px] font-bold uppercase tracking-tighter">
                      {isLocationLocked ? 'Locked' : 'Lock'}
                    </span>
                  </button>
                </div>

              {/* Real numbers instead of marketing filler */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-white rounded-4xl border border-slate-100 shadow-sm flex flex-col gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Leaf size={20} />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-800 leading-none">{produceTypeCount ?? '–'}</p>
                  <p className="text-xs font-semibold text-slate-500">fruits & vegetables the AI recognises</p>
                </div>
                <div className="p-5 bg-white rounded-4xl border border-slate-100 shadow-sm flex flex-col gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Clock size={20} />
                  </div>
                  <p className="text-2xl font-extrabold text-slate-800 leading-none">{expiringSoonCount}</p>
                  <p className="text-xs font-semibold text-slate-500">{history.length ? `of your ${history.length} scanned item${history.length === 1 ? '' : 's'} expire within 24 h` : 'items expiring soon (scan something to start)'}</p>
                </div>
              </div>

              {/* Hidden file input for photo upload fallback */}
              <input 
                type="file" 
                ref={fileInputRef} 
                accept="image/*" 
                onChange={handleFileUpload} 
                className="hidden" 
              />

              {user ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={startScanner}
                      className="bg-[#1AAB5F] hover:bg-[#158a4d] text-white py-5 px-4 rounded-3xl flex items-center justify-center gap-2 font-bold text-base shadow-lg shadow-green-100 transition-all hover:scale-[1.02] active:scale-95"
                    >
                      <Camera size={22} />
                      Scan Camera
                    </button>
                    <button 
                      onClick={triggerFileUpload}
                      className="bg-slate-800 hover:bg-slate-900 text-white py-5 px-4 rounded-3xl flex items-center justify-center gap-2 font-bold text-base shadow-lg shadow-slate-200 transition-all hover:scale-[1.02] active:scale-95"
                    >
                      <Upload size={22} />
                      Upload Photo
                    </button>
                  </div>

                  {/* Active Reminders Section */}
                  {history.some(item => item.alertEnabled) && (
                    <div className="space-y-4 pt-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Bell size={14} className="text-[#0097B2]" /> Active Freshness Alerts
                      </h3>
                      <div className="space-y-2">
                        {history.filter(item => item.alertEnabled).slice(0, 3).map(alert => (
                          <div key={alert.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg">
                                {alert.produceType.toLowerCase().includes('avocado') ? '🥑' :
                                 alert.produceType.toLowerCase().includes('mango') ? '🥭' :
                                 alert.produceType.toLowerCase().includes('banana') ? '🍌' : 
                                 alert.produceType.toLowerCase().includes('tomato') ? '🍅' :
                                 alert.produceType.toLowerCase().includes('apple') ? '🍎' :
                                 alert.produceType.toLowerCase().includes('orange') ? '🍊' :
                                 alert.produceType.toLowerCase().includes('lemon') ? '🍋' :
                                 alert.produceType.toLowerCase().includes('leaf') ? '🥬' : '📦'}
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-800 capitalize">{alert.produceType.replace('_', ' ')}</h4>
                                <div className="flex items-center gap-2">
                                  <p className="text-[10px] text-slate-500 font-bold uppercase">RUL: {alert.rulHours.toFixed(0)}h</p>
                                  {alert.alertThreshold && (
                                    <span className="text-[10px] text-[#0097B2] font-bold uppercase">Target: {alert.alertThreshold}h</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="px-3 py-1 bg-[#1AAB5F]/10 text-[#1AAB5F] text-[10px] font-bold rounded-full uppercase tracking-wider">
                              Monitoring
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 flex flex-col items-center gap-4 text-center">
                  <UserIcon size={32} className="text-[#1AAB5F]" />
                  <div className="space-y-1">
                    <h3 className="font-bold text-slate-800">History & Insights</h3>
                    <p className="text-xs text-slate-500">Connect with Google to save your scans and view nutrient trends.</p>
                  </div>
                  <button 
                    onClick={handleLogin}
                    className="w-full py-3 bg-white border border-slate-200 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <LogIn size={18} /> Connect with Google
                  </button>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-sm font-medium flex items-center gap-2">
                  <Info size={16} />
                  {error}
                </div>
              )}
            </motion.div>
          )}

          {view === 'scanner' && (
            <motion.div 
              key="scanner"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-[60] flex flex-col"
            >
              <div className="absolute top-8 left-6 right-6 flex justify-between items-center z-10">
                <button onClick={reset} className="p-2 bg-white/10 backdrop-blur rounded-full text-white">
                  <X size={24} />
                </button>
                <div className="px-4 py-2 bg-white/10 backdrop-blur rounded-full text-white text-sm font-medium">
                  Center Produce in Frame
                </div>
                <button onClick={triggerFileUpload} className="p-2 bg-white/10 backdrop-blur rounded-full text-white flex items-center justify-center" title="Upload Photo">
                  <Upload size={20} />
                </button>
              </div>

              <div className="flex-1 relative overflow-hidden bg-slate-950 flex items-center justify-center">
                <video 
                  ref={(el) => {
                    // @ts-ignore
                    videoRef.current = el;
                    if (el && cameraStream) {
                      if (el.srcObject !== cameraStream) {
                        el.srcObject = cameraStream;
                      }
                      el.muted = true;
                      el.play().catch(e => console.warn("Video play error:", e));
                    }
                  }}
                  autoPlay 
                  playsInline 
                  muted
                  onLoadedMetadata={(e) => {
                    e.currentTarget.muted = true;
                    e.currentTarget.play().catch(console.warn);
                  }}
                  onCanPlay={(e) => {
                    e.currentTarget.muted = true;
                    e.currentTarget.play().catch(console.warn);
                  }}
                  className="w-full h-full object-cover min-h-[300px]"
                />
                
                {cameraError && (
                  <div className="absolute inset-x-6 top-24 bg-slate-900/90 backdrop-blur border border-slate-800 p-4 rounded-2xl text-center space-y-3 z-20">
                    <p className="text-amber-400 text-xs font-semibold">{cameraError}</p>
                    <button 
                      onClick={triggerFileUpload}
                      className="px-4 py-2 bg-[#1AAB5F] hover:bg-[#158a4d] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 mx-auto"
                    >
                      <Upload size={14} /> Choose Image File
                    </button>
                  </div>
                )}
              </div>

              <canvas ref={canvasRef} className="hidden" />

              <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-6 z-10">
                <p className="text-white/60 text-sm font-medium">Auto-calibrating vision filters...</p>
                
                <div className="flex items-center gap-6">
                  <button 
                    onClick={triggerFileUpload}
                    className="w-12 h-12 bg-white/10 backdrop-blur hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
                    title="Upload image file"
                  >
                    <Upload size={20} />
                  </button>

                  <button 
                    onClick={captureAndPredict}
                    disabled={loading}
                    className="w-20 h-20 bg-white rounded-full flex items-center justify-center border-4 border-white/30 group active:scale-90 transition-transform"
                    title="Capture image"
                  >
                    <div className="w-16 h-16 bg-[#1AAB5F] rounded-full flex items-center justify-center text-white">
                      {loading ? <Loader2 size={32} className="animate-spin" /> : <Camera size={32} />}
                    </div>
                  </button>

                  <div className="w-12 h-12" />
                </div>
              </div>
            </motion.div>
          )}

          {view === 'result' && prediction && rul !== null && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="max-w-xl mx-auto space-y-6 lg:max-w-none lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start lg:space-y-0"
            >
              <div className="space-y-6">
              {/* Primary Produce Freshness Hero Card */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 flex flex-col items-center text-center relative overflow-hidden">
                {/* Visual Status Indicator & Quality Score Badge */}
                {isProduce && <div className="flex items-center justify-between w-full mb-3">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                    rul > 48 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' 
                      : rul >= 24 
                        ? 'bg-amber-50 text-amber-700 border-amber-200/60' 
                        : 'bg-rose-50 text-rose-700 border-rose-200/60'
                  }`}>
                    {getFreshnessLabel(rul).label}
                  </span>

                  <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">
                    Freshness {(prediction.quality_score * 100).toFixed(0)}%
                  </span>
                </div>}

                {isProduce && currentImage && (
                  <img src={currentImage} alt="Scanned produce" className="w-20 h-20 object-cover rounded-2xl border border-slate-200 mb-3" />
                )}

                {/* Produce Name & Verification Badge */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-1">
                  <h2 className={`text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight ${isProduce ? 'capitalize' : ''}`}>
                    {isProduce ? prediction.produce_type.replace(/_/g, ' ') : 'Not a fruit or vegetable'}
                  </h2>
                  {!isProduce && prediction.produce_type !== 'not_produce' && (
                    <span className="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 rounded-full font-bold capitalize">
                      {prediction.produce_type.replace(/_/g, ' ')}
                    </span>
                  )}
                  {feedbackState === 'correct' && (
                    <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                      ✓ Verified
                    </span>
                  )}
                </div>

                {isProduce && (
                  <div className="flex flex-col items-center gap-2 mb-2">
                    {prediction.confidence_score != null && prediction.source !== 'feedback' && (
                      prediction.low_confidence
                        ? <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">Not sure: best guess ({Math.round(prediction.confidence_score * 100)}%). Please check below</span>
                        : <span className="text-[11px] font-semibold text-slate-500">{Math.round(prediction.confidence_score * 100)}% sure</span>
                    )}
                    {feedbackState === 'none' && (prediction.alternative_candidates || []).length > 0 && (
                      <div className="flex flex-wrap justify-center items-center gap-1 text-[11px]">
                        <span className="text-slate-500 font-medium">Not {prettyName(prediction.produce_type)}?</span>
                        {(prediction.alternative_candidates || []).slice(0, 2).map(a => (
                          <button key={a.type} onClick={() => handleCorrection(a.type, true)}
                            className="px-2 py-0.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700">
                            {prettyName(a.type)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {prediction.source === 'feedback' && (
                  <p className="text-[11px] text-[#0097B2] bg-teal-50 border border-teal-100 rounded-xl px-3 py-1.5 mb-2 max-w-xs">
                    Recognised from earlier user feedback ({Math.round((prediction.matched_feedback?.similarity || 0) * 100)}% similar photo).
                  </p>
                )}

                {!isProduce && (
                  <div className="flex flex-col items-center gap-3 my-3">
                    {currentImage && (
                      <img src={currentImage} alt="Scanned" className="w-36 h-36 object-cover rounded-2xl border border-slate-200" />
                    )}
                    <p className="text-xs text-slate-500 max-w-xs">
                      BioFresh analyses fruits and vegetables only. This photo looks like something else, such as a person or an object, so no shelf life was calculated.
                    </p>
                  </div>
                )}

                {isProduce && <>
                {prediction.freshness_reliable === false && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/70 rounded-xl px-3 py-1.5 mb-2 max-w-xs">
                    Freshness was not assessed for {prediction.produce_type.replace('_', ' ')} (no fresh/rotten training images for it), so it is assumed fresh. Check it visually.
                  </p>
                )}

                {nutrients && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    Estimated weight: <strong className="text-slate-600 font-semibold">{nutrients.weightG}g</strong>
                  </span>
                )}

                {/* Big Hero Remaining Useful Life Number */}
                <div className="my-6 relative flex flex-col items-center">
                  {/* Days when there is time, hours when it is urgent (the model isn't precise to 0.1 h) */}
                  <div className="flex items-baseline justify-center">
                    <span className="text-7xl sm:text-8xl font-black text-slate-800 tracking-tighter">
                      {rul >= 48 ? Math.round(rul / 24) : Math.max(0, Math.round(rul))}
                    </span>
                    <span className="text-base font-bold text-slate-500 ml-2">
                      {rul >= 48 ? 'days' : Math.round(rul) === 1 ? 'hour' : 'hours'}
                    </span>
                  </div>
                  <div className="mt-2 bg-teal-50 text-[#0097B2] border border-teal-100 px-3.5 py-1 rounded-full text-xs font-bold">
                    {rul < 1 ? 'Past its best: check before eating' : rul >= 48 ? `of shelf life left (about ${Math.round(rul)} hours)` : 'left: use it soon'}
                  </div>
                </div>

                {/* Quick Quick Environmental Telemetry Ticker */}
                <div className="grid grid-cols-3 gap-2 w-full pt-4 border-t border-slate-100 text-center">
                  <div className="bg-slate-50/80 rounded-2xl p-2.5 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Temp</span>
                    <span className="text-sm font-bold text-slate-800">
                      {weather?.temperature_kelvin ? (weather.temperature_kelvin - 273.15).toFixed(1) : '20.0'}°C
                    </span>
                  </div>
                  <div className="bg-slate-50/80 rounded-2xl p-2.5 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Humidity</span>
                    <span className="text-sm font-bold text-slate-800">
                      {weather?.humidity_percent || 60}%
                    </span>
                  </div>
                  <div className="bg-slate-50/80 rounded-2xl p-2.5 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">In the fridge</span>
                    <span className="text-sm font-bold text-[#0097B2]">
                      {fridgeGainLabel}
                    </span>
                  </div>
                </div>
                </>}

                {/* Notification & Verification Actions */}
                <div className="w-full pt-4 space-y-2.5">
                  {isProduce && (
                    <button
                      onClick={toggleAlert}
                      className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs transition-all border ${
                        alertEnabled
                          ? 'bg-[#0097B2] text-white border-[#0097B2] shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Bell size={14} fill={alertEnabled ? "currentColor" : "none"} />
                      <span>{alertEnabled ? "Alert Set" : "Notify Me"}</span>
                    </button>
                  )}

                  {/* Feedback question: the answer is saved so similar photos are recognised next time */}
                  {feedbackState === 'none' && !showCorrection && (
                    <div className="w-full p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                      <p className="text-xs font-bold text-slate-700">
                        {isProduce
                          ? <>Is this <span className="capitalize">{prediction.produce_type.replace(/_/g, ' ')}</span>?</>
                          : 'Is it correct that this is not a fruit or vegetable?'}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleFeedback(true)}
                          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs border bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 transition-all"
                        >
                          <ThumbsUp size={14} /> Yes, correct
                        </button>
                        <button
                          onClick={() => handleFeedback(false)}
                          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs border bg-white text-rose-700 border-rose-200 hover:bg-rose-50 transition-all"
                        >
                          <ThumbsDown size={14} /> No, it's wrong
                        </button>
                      </div>
                    </div>
                  )}

                  {feedbackSaveState !== 'idle' && (
                    <p className={`text-[11px] font-semibold ${
                      feedbackSaveState === 'error' ? 'text-rose-600' : feedbackSaveState === 'saving' ? 'text-slate-400' : 'text-emerald-700'
                    }`}>
                      {feedbackSaveState === 'saving' ? 'Saving feedback…' : feedbackMessage}
                    </p>
                  )}

                  {alertEnabled && (
                    <div className="p-3 bg-teal-50/60 border border-teal-100 rounded-2xl space-y-2 text-left">
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-[#0097B2]">
                        <span className="flex items-center gap-1"><Clock size={11} /> Expiry Reminder</span>
                        <span>{alertThreshold}h remaining</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="72" 
                        step="1"
                        value={alertThreshold}
                        onChange={(e) => updateAlertThreshold(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-[#0097B2]/20 rounded-full appearance-none cursor-pointer accent-[#0097B2]"
                      />
                    </div>
                  )}

                  {/* Clean Correction Picker */}
                  {showCorrection && (
                    <div className="w-full pt-2 space-y-2 text-left bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <span>What is it? Pick one or type the name</span>
                        <button onClick={() => { setShowCorrection(false); setFeedbackState('none'); }} className="text-slate-400 hover:text-slate-600">Close</button>
                      </div>
                      {/* Quick picks: the model's next-best guesses, plus "not a fruit/vegetable" */}
                      <div className="flex flex-wrap gap-1">
                        {[
                          ...(prediction.alternative_candidates || []).map(a => ({ type: a.type, label: prettyName(a.type) })),
                          ...(isProduce ? [{ type: 'not_produce', label: '🚫 Not a fruit/vegetable' }] : []),
                        ].filter(item => item.type !== prediction.produce_type).map(item => (
                          <button
                            key={item.type}
                            onClick={() => {
                              handleCorrection(item.type, item.type !== 'not_produce');
                              setShowCorrection(false);
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-all"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                      {/* Every known fruit/vegetable */}
                      <select
                        value=""
                        onChange={(e) => { if (e.target.value) handleCorrection(e.target.value, true); }}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#0097B2]"
                      >
                        <option value="">Choose from all {KNOWN_PRODUCE.length} fruits & vegetables…</option>
                        {KNOWN_PRODUCE.filter(t => t !== prediction.produce_type).map(t => (
                          <option key={t} value={t}>{prettyName(t)}</option>
                        ))}
                      </select>
                      <form
                        className="space-y-2 pt-1"
                        onSubmit={(e) => {
                          // Enter key: guess from the name ("human" -> not produce)
                          e.preventDefault();
                          if (customLabel.trim()) handleCorrection(customLabel);
                        }}
                      >
                        <input
                          type="text"
                          value={customLabel}
                          onChange={(e) => setCustomLabel(e.target.value)}
                          placeholder="Or type the name, e.g. kiwi or human"
                          maxLength={40}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:border-[#0097B2]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={!customLabel.trim()}
                            onClick={() => handleCorrection(customLabel, true)}
                            className="px-2 py-2 rounded-lg bg-[#1AAB5F] text-white text-[11px] font-bold disabled:opacity-40"
                          >
                            Save: it's a fruit/vegetable
                          </button>
                          <button
                            type="button"
                            disabled={!customLabel.trim()}
                            onClick={() => handleCorrection(customLabel, false)}
                            className="px-2 py-2 rounded-lg bg-slate-700 text-white text-[11px] font-bold disabled:opacity-40"
                          >
                            Save: not a fruit/vegetable
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>

              </div>
              <div className="space-y-6">
              {isProduce && <>
              {/* Segmented Navigation Tabs to Keep UI Clean & Organized */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60">
                {[
                  { id: 'overview', label: 'Nutrition' },
                  { id: 'ai', label: '✨ AI Assistant' },
                  { id: 'how', label: 'How it works' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setResultActiveTab(tab.id as any)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center ${
                      resultActiveTab === tab.id
                        ? 'bg-white text-slate-800 shadow-xs border border-slate-200/80'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: NUTRITION & RECIPES OVERVIEW */}
              {resultActiveTab === 'overview' && (
                <div className="space-y-4">
                  {/* Nutritional Breakdown Card */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <Info size={14} className="text-[#0097B2]" /> Nutritional Index
                      </h3>
                      <span className="text-[10px] font-mono text-slate-400 uppercase">Estimated Retention</span>
                    </div>

                    <div className="space-y-3">
                      {nutrients?.nutrients.map(n => (
                        <div key={n.name} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-700 font-semibold">{n.name}</span>
                            <span className="text-slate-500 font-mono text-[11px]">
                              {n.currentValue.toFixed(1)}{n.unit} / {n.baseValue.toFixed(1)}{n.unit}
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, Math.max(5, n.percentage))}%` }}
                              className={`h-full rounded-full ${n.percentage > 80 ? 'bg-[#1AAB5F]' : n.percentage > 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Waste Minimization Recipes */}
                  {recipes.length > 0 && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-3">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          Zero-Waste Kitchen Rescue
                        </h3>
                        <span className="text-[10px] text-slate-500 font-medium font-mono">RUL &lt; 24h Trigger</span>
                      </div>

                      <div className="space-y-2">
                        {recipes.map(recipe => (
                          <div key={recipe.id} className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">
                                {recipe.name.includes('Bread') ? '🍞' : recipe.name.includes('Smoothie') ? '🥤' : '🥞'}
                              </span>
                              <div>
                                <h5 className="font-bold text-xs text-slate-800">{recipe.name}</h5>
                                <p className="text-[10px] text-slate-500">High Nutri-Conversion • 15m Prep</p>
                              </div>
                            </div>
                            <ChevronRight size={16} className="text-slate-300" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: GENERATIVE AI + AGENTIC AI (src/ai_engines on the server) */}
              {resultActiveTab === 'ai' && (
                <AIAssistant
                  produceType={prediction.produce_type}
                  qualityScore={prediction.quality_score}
                  rulHours={rul}
                  freshnessReliable={prediction.freshness_reliable}
                  temperatureC={weather?.temperature_kelvin ? weather.temperature_kelvin - 273.15 : undefined}
                  humidityPercent={weather?.humidity_percent}
                  locationName={weather?.location_name || localStorage.getItem('biofresh_location_name') || undefined}
                  storage={localStorage.getItem('biofresh_storage_env') || 'room'}
                  history={history}
                  onApplyReminder={applyAgentReminder}
                />
              )}
              {resultActiveTab === 'ai' && (
                <RAGKnowledgeAdvisor
                  produceType={prediction.produce_type}
                  qualityScore={prediction.quality_score}
                  rulHours={rul}
                />
              )}

              {/* TAB: HOW IT WORKS (real numbers for this scan + real model metrics) */}
              {resultActiveTab === 'how' && (
                <HowItWorks
                  produceType={prediction.produce_type}
                  qualityScore={prediction.quality_score}
                  confidence={prediction.confidence_score}
                  freshnessReliable={prediction.freshness_reliable}
                  source={prediction.source}
                  matchedSimilarity={prediction.matched_feedback?.similarity}
                  alternatives={prediction.alternative_candidates}
                  rulHours={rul}
                  temperatureK={weather?.temperature_kelvin || 293.15}
                  storage={localStorage.getItem('biofresh_storage_env') || 'room'}
                />
              )}
              </>}

              {/* Global Discard / New Scan Button */}
              <button 
                onClick={reset}
                className="w-full py-4 rounded-2xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <RefreshCw size={15} /> Discard & Start New Scan
              </button>
              </div>
            </motion.div>
          )}

          {view === 'history' && (
             <motion.div 
               key="history"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="space-y-6"
             >
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2.5">
                   <h2 className="text-2xl font-bold text-slate-800">Scan History</h2>
                   {history.length > 0 && (
                     <span className="px-2.5 py-0.5 bg-[#1AAB5F]/10 text-[#1AAB5F] border border-[#1AAB5F]/20 text-xs font-bold rounded-full">
                       {history.length}
                     </span>
                   )}
                 </div>
                 
                 <div className="flex items-center gap-2">
                   <button 
                     onClick={() => loadHistory()} 
                     disabled={fetchingHistory}
                     className="p-2 bg-white rounded-full border border-slate-200 text-slate-500 hover:text-[#1AAB5F] hover:border-[#1AAB5F]/30 transition-all active:scale-95 shadow-xs flex items-center justify-center"
                     title="Refresh history from Firestore"
                   >
                     <RefreshCw size={18} className={fetchingHistory ? "animate-spin text-[#1AAB5F]" : ""} />
                   </button>
                   <button 
                     onClick={() => setView('home')} 
                     className="p-2 bg-white rounded-full border border-slate-200 text-slate-400 hover:text-slate-600 transition-all active:scale-95 shadow-xs"
                   >
                     <X size={18} />
                   </button>
                 </div>
               </div>

               {/* Firestore Sync & User Banner */}
               <div className="p-3 bg-white border border-slate-100 rounded-2xl flex items-center justify-between text-xs text-slate-500 shadow-xs">
                 <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-[#1AAB5F] animate-pulse" />
                   <span className="font-semibold text-slate-700">Firestore Cloud Sync</span>
                 </div>
                 <span className="text-[11px] bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100 font-medium">
                   {user?.isAnonymous ? '👤 Guest Session' : user?.email ? `✉️ ${user.email}` : 'Connected'}
                 </span>
               </div>

               {fetchingHistory ? (
                 <div className="flex flex-col items-center justify-center py-20 gap-4">
                   <Loader2 size={48} className="animate-spin text-[#1AAB5F]" />
                   <p className="text-sm text-slate-400 font-medium">Fetching your freshness history from Firestore...</p>
                 </div>
               ) : history.length > 0 ? (
                 <div className="space-y-4">
                   {history.map(item => (
                     <button 
                       key={item.id || item.timestamp.toString()} 
                       onClick={() => openHistoryItem(item)}
                       className="w-full text-left bg-white p-5 rounded-4xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-[#1AAB5F]/30 transition-all hover:scale-[1.01] active:scale-[0.99] group"
                     >
                       <div className="w-16 h-16 rounded-2xl bg-slate-50 flex-shrink-0 overflow-hidden border border-slate-100 shadow-inner flex items-center justify-center relative">
                         {item.imageUrl ? (
                           <img src={item.imageUrl} alt={item.produceType} className="w-full h-full object-cover" />
                         ) : (
                           <span className="text-2xl">
                             {item.produceType.toLowerCase().includes('avocado') ? '🥑' : 
                              item.produceType.toLowerCase().includes('mango') ? '🥭' :
                              item.produceType.toLowerCase().includes('banana') ? '🍌' : 
                              item.produceType.toLowerCase().includes('tomato') ? '🍅' :
                              item.produceType.toLowerCase().includes('apple') ? '🍎' :
                              item.produceType.toLowerCase().includes('leaf') ? '🥬' : '📦'}
                           </span>
                         )}
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center justify-between">
                           <h4 className="font-bold text-slate-800 capitalize truncate group-hover:text-[#1AAB5F] transition-colors">{item.produceType.replace('_', ' ')}</h4>
                           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{new Date(item.timestamp).toLocaleDateString()}</span>
                         </div>
                         <div className="flex items-center gap-4 mt-2">
                           <div className="flex items-center gap-1.5 text-[#1AAB5F]">
                             <Leaf size={12} fill="currentColor" />
                             <span className="text-[10px] font-bold uppercase tracking-widest">
                               {formatShelfLife(item.rulHours)}
                             </span>
                           </div>
                           <div className="flex items-center gap-1.5 text-[#0097B2]">
                             <Thermometer size={12} />
                             <span className="text-[10px] font-bold uppercase tracking-widest">{(item.temperatureK - 273.15).toFixed(0)}°C</span>
                           </div>
                         </div>
                       </div>
                       <ChevronRight size={18} className="text-slate-300 group-hover:text-[#1AAB5F] group-hover:translate-x-0.5 transition-all" />
                     </button>
                   ))}
                 </div>
               ) : (
                 <div className="bg-white rounded-4xl p-12 flex flex-col items-center justify-center text-center space-y-4 border border-slate-100 shadow-sm">
                   <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                     <HistoryIcon size={32} strokeWidth={1.5} />
                   </div>
                   <div className="space-y-1">
                    <p className="font-bold text-slate-700">No Past Scans Yet</p>
                    <p className="text-xs text-slate-400 max-w-xs">Take a photo of any fruit or vegetable to calculate its shelf life and store it in your archive.</p>
                   </div>
                   <button 
                     onClick={startScanner}
                     className="mt-2 px-6 py-2.5 bg-[#1AAB5F] text-white font-bold text-xs rounded-full shadow-md shadow-green-100 hover:bg-[#159451] transition-all flex items-center gap-2 active:scale-95"
                   >
                     <Camera size={16} /> Scan Produce Now
                   </button>
                 </div>
               )}
             </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* History Detail Modal/Overlay */}
      <AnimatePresence>
        {selectedHistoryItem && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col bg-slate-50 overflow-y-auto"
          >
            <div className="max-w-md mx-auto w-full px-6 pt-12 pb-24 space-y-6">
              <div className="flex items-center justify-between">
                <button onClick={() => setSelectedHistoryItem(null)} className="p-2 bg-white rounded-full shadow-sm text-slate-600">
                  <X size={24} />
                </button>
                <div className="text-center">
                  <h3 className="font-bold text-slate-800">Scan Details</h3>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Captured {new Date(selectedHistoryItem.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="w-10" />
              </div>

              {selectedHistoryItem.imageUrl && (
                <div className="w-full aspect-square rounded-4xl overflow-hidden border-8 border-white shadow-xl shadow-slate-200">
                  <img src={selectedHistoryItem.imageUrl} alt="Captured scan" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200 border border-slate-100 flex flex-col items-center text-center space-y-4">
                <div className="flex flex-col items-center gap-1 mb-2">
                  <span className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    selectedHistoryItem.rulHours > 48 
                      ? 'bg-green-50 text-green-600 border-green-100' 
                      : selectedHistoryItem.rulHours >= 24 
                        ? 'bg-amber-50 text-[#D4860A] border-amber-100' 
                        : 'bg-red-50 text-red-600 border-red-100'
                  }`}>
                    {getFreshnessLabel(selectedHistoryItem.rulHours).label}
                  </span>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight capitalize mt-2">
                    {selectedHistoryItem.produceType.replace('_', ' ')}
                  </h2>
                </div>
                <div className="relative">
                   <div className="text-7xl font-light text-slate-800 tracking-tighter">
                    {formatShelfLife(selectedHistoryItem.rulHours).split(' ')[0]}
                    <span className="text-base font-bold text-slate-500 ml-2 tracking-normal">{formatShelfLife(selectedHistoryItem.rulHours).split(' ')[1]}</span>
                  </div>
                </div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest pt-4">Shelf life at scan time</p>
                
                <div className="w-full pt-8 flex flex-col gap-4 border-t border-slate-50 mt-4">
                  <button 
                    onClick={() => toggleHistoryAlert(selectedHistoryItem)}
                    className={`flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-sm transition-all ${
                      selectedHistoryItem.alertEnabled 
                        ? 'bg-[#0097B2] text-white shadow-lg shadow-cyan-100' 
                        : 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    <Bell size={20} fill={selectedHistoryItem.alertEnabled ? "currentColor" : "none"} />
                    {selectedHistoryItem.alertEnabled ? "Freshness Alert Active" : "Enable Freshness Alert"}
                  </button>

                  {selectedHistoryItem.alertEnabled && (
                    <div className="p-4 bg-[#0097B2]/5 border border-[#0097B2]/10 rounded-2xl space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-[#0097B2]">
                        <span className="flex items-center gap-2"><Clock size={12} /> Reminder Threshold</span>
                        <span>{selectedHistoryItem.alertThreshold || 12}h remaining</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="72" 
                        step="1"
                        value={selectedHistoryItem.alertThreshold || 12}
                        onChange={(e) => updateHistoryAlertThreshold(selectedHistoryItem, parseInt(e.target.value))}
                        className="w-full h-1.5 bg-[#0097B2]/20 rounded-full appearance-none cursor-pointer accent-[#0097B2]"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-8 w-full pt-8 border-t border-slate-50">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Temperature</span>
                    <span className="text-xl font-bold text-[#0097B2]">{(selectedHistoryItem.temperatureK - 273.15).toFixed(1)}°C</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                     <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Humidity</span>
                    <span className="text-xl font-bold text-[#0097B2]">{selectedHistoryItem.humidity}%</span>
                  </div>
                </div>
              </div>


              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100 space-y-6">
                <div className="flex justify-between items-end">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Info size={12} /> Historical Nutrition (Approximate)
                  </h3>
                  <span className="text-[10px] font-bold text-slate-500 tracking-tighter uppercase font-mono">Estimated Content</span>
                </div>
                <div className="space-y-4">
                  {getNutrientRetention(selectedHistoryItem.produceType, selectedHistoryItem.qualityScore).nutrients.map(n => (
                    <div key={n.name} className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-slate-600 uppercase tracking-tight">{n.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-700 font-bold">
                            {n.currentValue.toFixed(n.unit === 'mg' || n.unit === 'g' ? 1 : 0)}{n.unit}
                          </span>
                          <span className="text-slate-400 font-normal">
                            / {n.baseValue.toFixed(n.unit === 'mg' || n.unit === 'g' ? 1 : 0)}{n.unit}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100/50">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, Math.max(5, n.percentage))}%` }}
                          className={`h-full rounded-full ${n.percentage > 80 ? 'bg-[#1AAB5F]' : n.percentage > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => handleDeleteHistoryItem(selectedHistoryItem)}
                  className="px-5 py-4 rounded-full border border-red-200 text-red-600 hover:bg-red-50 font-bold text-sm transition-colors flex items-center justify-center gap-2"
                  title="Delete this scan from history"
                >
                  <Trash2 size={16} /> Delete
                </button>
                <button 
                  onClick={() => setSelectedHistoryItem(null)}
                  className="flex-1 py-4 rounded-full bg-slate-800 text-white font-bold text-sm hover:bg-slate-900 transition-colors"
                >
                  Close Details
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav */}
      <nav className="fixed bottom-6 left-6 right-6 max-w-md mx-auto z-40">
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/50 px-8 py-3 flex justify-around items-center rounded-full shadow-2xl shadow-slate-200/50">
          <button onClick={reset} className={`flex flex-col items-center gap-0.5 p-1 transition-all ${view === 'home' ? 'text-[#1AAB5F]' : 'text-slate-500'}`}>
            <Leaf size={22} strokeWidth={2.5} />
            <span className="text-[10px] font-bold">Home</span>
          </button>
          <button 
            onClick={startScanner} 
            className="w-14 h-14 bg-[#1AAB5F] rounded-full -mt-12 border-4 border-slate-50 flex items-center justify-center text-white shadow-xl shadow-green-200 transition-all hover:scale-110 active:scale-95"
            aria-label="Scan with camera"
          >
            <Camera size={28} strokeWidth={2.5} />
          </button>
          <button 
            onClick={() => user ? setView('history') : handleLogin()} 
            className={`flex flex-col items-center gap-0.5 p-1 transition-all ${view === 'history' ? 'text-[#0097B2]' : 'text-slate-500'}`}>
            <HistoryIcon size={22} strokeWidth={2.5} />
            <span className="text-[10px] font-bold">History</span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {showLocationModal && (
          <LocationSelectorModal 
            onClose={() => setShowLocationModal(false)}
            onSelect={handleManualLocation}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
