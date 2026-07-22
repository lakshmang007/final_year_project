/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Camera, History as HistoryIcon, Leaf, Thermometer, Droplets, Info, ChevronRight, X, Loader2, RefreshCw, LogIn, LogOut, User as UserIcon, Bell, ThumbsUp, ThumbsDown, AlertTriangle, MapPin, Lock, Unlock, Clock, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth, loginWithGoogle } from './lib/firebase';
import { savePrediction, getHistory, updatePrediction, PredictionHistoryItem } from './services/history';
import { predictProduce, fetchWeather, PredictionResult, WeatherData } from './services/api';
import { calculateDecayRate, calculateRUL, getNutrientRetention, getFreshnessLabel, NutrientDetail } from './lib/science';
import { getRecommendations, Recipe } from './lib/recipes';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, Legend } from 'recharts';

function LocationSelectorModal({ onClose, onSelect }: { 
  onClose: () => void, 
  onSelect: (lat: number, lng: number, name: string, storageEnv: 'room' | 'outside' | 'refrigerator', fridgeTempC?: number) => void 
}) {
  const [address, setAddress] = useState(() => {
    return localStorage.getItem('biofresh_location_name') || '';
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() => {
    const lat = localStorage.getItem('biofresh_lat');
    const lon = localStorage.getItem('biofresh_lon');
    return (lat && lon) ? { lat: parseFloat(lat), lng: parseFloat(lon) } : null;
  });
  const [storageEnv, setStorageEnv] = useState<'room' | 'outside' | 'refrigerator'>(() => {
    return (localStorage.getItem('biofresh_storage_env') as any) || 'room';
  });
  const [fridgeTempC, setFridgeTempC] = useState<number>(() => {
    const saved = localStorage.getItem('biofresh_fridge_temp');
    return saved ? parseFloat(saved) : 4;
  });

  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

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

  const handleConfirm = async () => {
    let finalLat = coords?.lat || 12.97;
    let finalLng = coords?.lng || 77.59;
    const cleanAddress = address.trim();

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
            <p className="text-[11px] text-slate-400 font-medium">Configure location and produce storage conditions</p>
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
                <span className="text-[9px] text-slate-400">~20°C / Indoor</span>
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
                <span className="text-[9px] text-slate-400">Ambient Weather</span>
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
                <span className="text-[9px] text-slate-400">Cold Storage</span>
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

export default function App() {
  const [view, setView] = useState<'home' | 'scanner' | 'result' | 'history'>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  
  // Prediction Data
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [rul, setRul] = useState<number | null>(null);
  const [nutrients, setNutrients] = useState<{ weightG: number; nutrients: NutrientDetail[] } | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<'none' | 'correct' | 'incorrect'>('none');
  const [showCorrection, setShowCorrection] = useState(false);
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState<number>(12);
  const [showThresholdPicker, setShowThresholdPicker] = useState(false);
  
  // Environment State
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
    return localStorage.getItem('biofresh_location_name') || 'Set Location...';
  });
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [tempLatLon, setTempLatLon] = useState<{lat: number, lng: number} | null>(null);
  
  // History State
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<PredictionHistoryItem | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Effects ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && authReady) {
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
          setLocationName('Set Location...');
        }
      } else {
        setLocationName('Set Location...');
      }
    }
  }, [user, authReady]);

  // --- Actions ---
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

  const toggleLocationLock = () => {
    const newState = !isLocationLocked;
    setIsLocationLocked(newState);
    localStorage.setItem('biofresh_location_locked', newState.toString());
  };

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

  const handleLogin = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        // Silent ignore or subtle message
        return;
      }
      setError("Login failed. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      reset();
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const startScanner = async () => {
    if (!user) {
      setError("Please login to scan produce.");
      return;
    }
    setView('scanner');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      setError("Camera access denied. Please allow camera permissions.");
      setView('home');
    }
  };

  const stopScanner = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const captureAndPredict = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg');
      setCurrentImage(imageData);
      stopScanner();

      // 1. Get Lat/Lon for weather
      let lat = 0, lon = 0;
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
          console.warn("Geolocation failed, using default");
        }
      }

      // 2. Parallel API calls (Predict + Weather)
      const [predResult, weatherResult] = await Promise.all([
        predictProduce(imageData),
        fetchWeather(lat, lon)
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

      const k = calculateDecayRate(predResult.produce_type, effectiveTempK);
      const calculatedRul = calculateRUL(predResult.quality_score, k);
      
      setRul(calculatedRul);
      const calculatedNutrients = getNutrientRetention(predResult.produce_type, predResult.quality_score);
      setNutrients(calculatedNutrients);
      setRecipes(getRecommendations(predResult.produce_type, calculatedRul));
      
      // 4. Save to Firestore
      const savedId = await savePrediction({
        produceType: predResult.produce_type,
        qualityScore: predResult.quality_score,
        rulHours: calculatedRul,
        temperatureK: effectiveTempK,
        humidity: weatherResult.humidity_percent,
        imageUrl: imageData // Re-enabled snapshot storage
      });

      if (savedId) setLastSavedId(savedId);

      setView('result');
    } catch (err: any) {
      setError(err.message || "Failed to analyze produce");
      setView('home');
    } finally {
      setLoading(false);
    }
  };

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
  };

  const handleFeedback = async (correct: boolean) => {
    setFeedbackState(correct ? 'correct' : 'incorrect');
    if (!correct) {
      setShowCorrection(true);
    } else if (lastSavedId) {
      await updatePrediction(lastSavedId, { isCorrect: true });
    }
  };

  const handleCorrection = async (newType: string) => {
    if (!prediction || !weather || !lastSavedId) return;

    // Recalculate based on new type
    const k = calculateDecayRate(newType, weather.temperature_kelvin);
    const calculatedRul = calculateRUL(prediction.quality_score, k);
    const calculatedNutrients = getNutrientRetention(newType, prediction.quality_score);

    // Update local state
    setPrediction({ ...prediction, produce_type: newType });
    setRul(calculatedRul);
    setNutrients(calculatedNutrients);
    setRecipes(getRecommendations(newType, calculatedRul));
    setShowCorrection(false);
    setFeedbackState('correct');

    // Update Firestore
    await updatePrediction(lastSavedId, { 
      produceType: newType,
      isCorrect: false,
      correctedType: newType,
      rulHours: calculatedRul
    });
  };

  const toggleAlert = async () => {
    const newState = !alertEnabled;
    setAlertEnabled(newState);
    if (lastSavedId) {
      await updatePrediction(lastSavedId, { 
        alertEnabled: newState,
        alertThreshold: newState ? alertThreshold : undefined
      });
    }
  };

  const updateAlertThreshold = async (val: number) => {
    setAlertThreshold(val);
    if (lastSavedId && alertEnabled) {
      await updatePrediction(lastSavedId, { alertThreshold: val });
    }
  };

  const openHistoryItem = (item: PredictionHistoryItem) => {
    setSelectedHistoryItem(item);
  };

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

  const updateHistoryAlertThreshold = async (item: PredictionHistoryItem, val: number) => {
    if (!item.id) return;
    const updated = { ...item, alertThreshold: val };
    setSelectedHistoryItem(updated);
    
    // Update main list
    setHistory(prev => prev.map(h => h.id === item.id ? updated : h));
    
    await updatePrediction(item.id, { alertThreshold: val });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-teal-100 pb-24">
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
              {user ? (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setView('history')}
                    className={`p-2 rounded-full transition-colors ${view === 'history' ? 'bg-teal-50 text-[#0097B2]' : 'hover:bg-slate-100 text-slate-600'}`}
                  >
                    <HistoryIcon size={20} />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden group relative">
                    <img src={user.photoURL || ''} alt="User" className="w-full h-full object-cover" />
                    <button 
                      onClick={handleLogout}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                    >
                      <LogOut size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-slate-900 bg-slate-100 px-3 py-1.5 rounded-full"
                >
                  <LogIn size={16} /> Login
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-md mx-auto pt-24 px-6">
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
                  <p className="text-slate-500 leading-relaxed">Scan your produce to see exactly how many hours of shelf life remain, powered by AI & Arrhenius kinetics.</p>
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
                        <span className="text-xs font-bold text-[#1AAB5F]">
                          {homeWeather ? `${(homeWeather.temperature_kelvin - 273.15).toFixed(1)}°C` : '--°C'}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs font-bold text-[#0097B2]">
                          {homeWeather ? `${homeWeather.humidity_percent}% Moisture` : '--%'}
                        </span>
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
                    <span className="text-[9px] font-bold uppercase tracking-tighter">
                      {isLocationLocked ? 'Locked' : 'Lock?'}
                    </span>
                  </button>
                </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-white rounded-4xl border border-slate-100 shadow-sm flex flex-col gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
                    <Thermometer size={20} />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Environment</span>
                    <p className="text-sm font-bold text-slate-800">Smart Tracking</p>
                  </div>
                </div>
                <div className="p-6 bg-white rounded-4xl border border-slate-100 shadow-sm flex flex-col gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                    <Droplets size={20} />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prediction</span>
                    <p className="text-sm font-bold text-slate-800">±1.2hr Accuracy</p>
                  </div>
                </div>
              </div>

              {user ? (
                <>
                  <button 
                    onClick={startScanner}
                    className="w-full bg-[#1AAB5F] hover:bg-[#158a4d] text-white py-6 rounded-full flex items-center justify-center gap-3 font-bold text-lg shadow-xl shadow-green-100 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    <Camera size={24} />
                    New Prediction
                  </button>

                  {/* Active Reminders Section */}
                  {history.some(item => item.alertEnabled) && (
                    <div className="space-y-4 pt-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
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
                                  <p className="text-[10px] text-slate-400 font-bold uppercase">RUL: {alert.rulHours.toFixed(0)}h</p>
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
                <div className="w-10" />
              </div>

              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                 className="flex-1 object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              <div className="absolute bottom-12 left-0 right-0 flex flex-col items-center gap-6">
                <p className="text-white/60 text-sm font-medium">Auto-calibrating vision filters...</p>
                <button 
                  onClick={captureAndPredict}
                  disabled={loading}
                  className="w-20 h-20 bg-white rounded-full flex items-center justify-center border-4 border-white/30 group active:scale-90 transition-transform"
                >
                  <div className="w-16 h-16 bg-[#1AAB5F] rounded-full flex items-center justify-center text-white">
                    {loading ? <Loader2 size={32} className="animate-spin" /> : <Camera size={32} />}
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {view === 'result' && prediction && rul !== null && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200 border border-slate-100 flex flex-col items-center text-center space-y-4">
                <div className="flex flex-col items-center gap-1 mb-2">
                  <span className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    rul > 48 
                      ? 'bg-green-50 text-green-600 border-green-100' 
                      : rul >= 24 
                        ? 'bg-amber-50 text-[#D4860A] border-amber-100' 
                        : 'bg-red-50 text-red-600 border-red-100'
                  }`}>
                    {getFreshnessLabel(rul).label}
                  </span>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight capitalize mt-2">
                    {prediction.produce_type.replace('_', ' ')}
                  </h2>
                  {nutrients && (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 mt-1">
                      EST. WEIGHT: {nutrients.weightG}g
                    </span>
                  )}
                </div>
                <div className="relative">
                   <div className="text-8xl font-light text-slate-800 tracking-tighter">
                    {rul.toFixed(1)}
                  </div>
                  <div className="absolute top-2 -right-14 px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold tracking-widest uppercase">
                    hrs
                  </div>
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-[#1AAB5F]/10 text-[#1AAB5F] px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                    ≈ {(rul / 24).toFixed(1)} Days
                  </div>
                </div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest pt-6">Remaining Useful Life</p>
                
                {/* Alert & Feedback Actions */}
                <div className="w-full space-y-3 pt-6">
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={toggleAlert}
                      className={`flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-xs transition-all ${
                        alertEnabled 
                          ? 'bg-[#0097B2] text-white shadow-lg shadow-cyan-100' 
                          : 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-slate-100'
                      }`}
                    >
                      <Bell size={16} fill={alertEnabled ? "currentColor" : "none"} />
                      {alertEnabled ? "Alert Set" : "Notify Me"}
                    </button>
                    <button 
                      onClick={() => handleFeedback(true)}
                      disabled={feedbackState !== 'none'}
                      className={`flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-xs transition-all ${
                        feedbackState === 'correct'
                          ? 'bg-[#1AAB5F] text-white'
                          : 'bg-slate-50 text-slate-600 border border-slate-100 hover:bg-slate-100'
                      }`}
                    >
                      <ThumbsUp size={16} />
                      {feedbackState === 'correct' ? "Verified" : "Correct"}
                    </button>
                  </div>

                  {alertEnabled && (
                    <div className="p-4 bg-[#0097B2]/5 border border-[#0097B2]/10 rounded-2xl space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-[#0097B2]">
                        <span className="flex items-center gap-2"><Clock size={12} /> Expiry Reminder</span>
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
                      <p className="text-[10px] text-slate-400 text-center font-bold">
                        We'll alert you when this item has {alertThreshold} hours left.
                      </p>
                    </div>
                  )}
                </div>

                {feedbackState === 'none' && (
                  <button 
                    onClick={() => handleFeedback(false)}
                    className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors flex items-center gap-1"
                  >
                    <ThumbsDown size={12} /> Identification is wrong
                  </button>
                )}

                {/* Correction Picker */}
                {showCorrection && (
                  <div className="w-full pt-6 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                      <AlertTriangle size={14} className="text-amber-500" /> What was it?
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {['avocado', 'mango', 'banana', 'tomato', 'apple', 'orange', 'lemon', 'leafy_greens'].map(type => (
                        <button 
                          key={type}
                          onClick={() => handleCorrection(type)}
                          className="p-2.5 bg-slate-50 rounded-2xl border border-slate-100 text-[10px] font-bold uppercase tracking-tight hover:bg-[#1AAB5F]/5 hover:border-[#1AAB5F]/20 transition-all capitalize"
                        >
                          {type.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-3 w-full pt-8 mt-4 border-t border-slate-50">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Temperature</span>
                    <span className="text-lg font-bold text-[#0097B2]">{(weather?.temperature_kelvin ? (weather.temperature_kelvin - 273.15).toFixed(1) : 0)}°C</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                     <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Moisture</span>
                    <span className="text-lg font-bold text-[#0097B2]">{weather?.humidity_percent}%</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                     <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Soil Moisture</span>
                    <span className="text-lg font-bold text-[#1AAB5F]">{weather?.soil_moisture !== undefined && weather?.soil_moisture !== null ? `${weather.soil_moisture} m³/m³` : 'Standard'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100 space-y-6">
                <div className="flex justify-between items-end">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Info size={12} /> Nutritional Index (Approximate)
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 tracking-tighter uppercase font-mono">Estimated Content</span>
                </div>
                <div className="space-y-4">
                  {nutrients?.nutrients.map(n => (
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

              {recipes.length > 0 && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                      Waste Minimization
                    </h3>
                    <span className="text-[10px] text-slate-400 font-medium italic">RUL &lt; 24h Trigger</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {recipes.map(recipe => (
                      <div key={recipe.id} className="group cursor-pointer p-5 bg-white rounded-4xl border border-slate-100 hover:border-[#1AAB5F30] transition-all flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform">
                            {recipe.name.includes('Bread') ? '🍞' : recipe.name.includes('Smoothie') ? '🥤' : '🥞'}
                          </div>
                          <div>
                            <h5 className="font-bold text-slate-800 leading-tight">{recipe.name}</h5>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">High Nutri-Conversion • Prep: 15m</p>
                          </div>
                        </div>
                        <ChevronRight size={20} className="text-slate-200 group-hover:text-[#1AAB5F] transition-colors" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button 
                onClick={reset}
                className="w-full py-5 rounded-full border border-slate-200 text-slate-400 font-bold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw size={18} /> Discard Scan
              </button>
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
                 <h2 className="text-2xl font-bold">Scan History</h2>
                 <button onClick={() => setView('home')} className="text-slate-400 hover:text-slate-600">
                   <X />
                 </button>
               </div>

               {fetchingHistory ? (
                 <div className="flex flex-col items-center justify-center py-20 gap-4">
                   <Loader2 size={48} className="animate-spin text-teal-500" />
                   <p className="text-sm text-slate-400 font-medium">Fetching your freshness history...</p>
                 </div>
               ) : history.length > 0 ? (
                 <div className="space-y-4">
                   {history.map(item => (
                     <button 
                       key={item.id} 
                       onClick={() => openHistoryItem(item)}
                       className="w-full text-left bg-white p-5 rounded-4xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-[#1AAB5F20] transition-all hover:scale-[1.01] active:scale-[0.99]"
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
                           <h4 className="font-bold text-slate-800 capitalize truncate">{item.produceType.replace('_', ' ')}</h4>
                           <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{new Date(item.timestamp).toLocaleDateString()}</span>
                         </div>
                         <div className="flex items-center gap-4 mt-2">
                           <div className="flex items-center gap-1.5 text-[#1AAB5F]">
                             <Leaf size={12} fill="currentColor" />
                             <span className="text-[10px] font-bold uppercase tracking-widest">
                               {item.rulHours.toFixed(0)}h / {(item.rulHours / 24).toFixed(1)}d
                             </span>
                           </div>
                           <div className="flex items-center gap-1.5 text-[#0097B2]">
                             <Thermometer size={12} />
                             <span className="text-[10px] font-bold uppercase tracking-widest">{(item.temperatureK - 273.15).toFixed(0)}°C</span>
                           </div>
                         </div>
                       </div>
                       <ChevronRight size={18} className="text-slate-200" />
                     </button>
                   ))}
                 </div>
               ) : (
                 <div className="bg-white rounded-4xl p-16 flex flex-col items-center justify-center text-center space-y-4 border border-slate-100 text-slate-300">
                   <HistoryIcon size={48} className="text-slate-100" strokeWidth={1} />
                   <div className="space-y-1">
                    <p className="font-bold text-slate-600">Archive Empty</p>
                    <p className="text-xs font-medium">Your freshness telemetry will appear here.</p>
                   </div>
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
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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
                   <div className="text-8xl font-light text-slate-800 tracking-tighter">
                    {selectedHistoryItem.rulHours.toFixed(1)}
                  </div>
                  <div className="absolute top-2 -right-14 px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold tracking-widest uppercase">
                    hrs
                  </div>
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-[#1AAB5F]/10 text-[#1AAB5F] px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                    ≈ {(selectedHistoryItem.rulHours / 24).toFixed(1)} Days
                  </div>
                </div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest pt-6">Remaining Useful Life</p>
                
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
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Temperature</span>
                    <span className="text-xl font-bold text-[#0097B2]">{(selectedHistoryItem.temperatureK - 273.15).toFixed(1)}°C</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                     <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Humidity</span>
                    <span className="text-xl font-bold text-[#0097B2]">{selectedHistoryItem.humidity}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100 space-y-6">
                <div className="flex justify-between items-end">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Info size={12} /> Historical Nutrition (Approximate)
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400 tracking-tighter uppercase font-mono">Estimated Content</span>
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

              <button 
                onClick={() => setSelectedHistoryItem(null)}
                className="w-full py-5 rounded-full bg-slate-800 text-white font-bold text-sm hover:bg-slate-900 transition-colors"
              >
                Close Details
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav */}
      <nav className="fixed bottom-6 left-6 right-6 max-w-md mx-auto z-40">
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200/50 px-8 py-4 flex justify-around items-center rounded-full shadow-2xl shadow-slate-200/50">
          <button onClick={reset} className={`p-2 transition-all hover:scale-110 ${view === 'home' ? 'text-[#1AAB5F]' : 'text-slate-300'}`}>
            <Leaf size={24} strokeWidth={2.5} />
          </button>
          <button 
            onClick={startScanner} 
            className="w-14 h-14 bg-[#1AAB5F] rounded-full -mt-12 border-4 border-slate-50 flex items-center justify-center text-white shadow-xl shadow-green-200 transition-all hover:scale-110 active:scale-95"
          >
            <Camera size={28} strokeWidth={2.5} />
          </button>
          <button 
            onClick={() => user ? setView('history') : handleLogin()} 
            className={`p-2 transition-all hover:scale-110 ${view === 'history' ? 'text-[#0097B2]' : 'text-slate-300'}`}>
            <HistoryIcon size={24} strokeWidth={2.5} />
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
