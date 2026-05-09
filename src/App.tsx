/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Camera, History as HistoryIcon, Leaf, Thermometer, Droplets, Info, ChevronRight, X, Loader2, RefreshCw, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { auth, loginWithGoogle } from './lib/firebase';
import { savePrediction, getHistory, PredictionHistoryItem } from './services/history';
import { predictProduce, fetchWeather, PredictionResult, WeatherData } from './services/api';
import { calculateDecayRate, calculateRUL, getNutrientRetention, getFreshnessLabel, NutrientDetail } from './lib/science';
import { getRecommendations, Recipe } from './lib/recipes';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, Legend } from 'recharts';

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
  
  // History State
  const [history, setHistory] = useState<PredictionHistoryItem[]>([]);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  
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
    if (view === 'history' && user && authReady) {
      loadHistory();
    }
  }, [view, user, authReady]);

  // --- Actions ---
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
      try {
        const pos: any = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch (e) {
        console.warn("Geolocation failed, using default");
      }

      // 2. Parallel API calls (Predict + Weather)
      const [predResult, weatherResult] = await Promise.all([
        predictProduce(imageData),
        fetchWeather(lat, lon)
      ]);

      setPrediction(predResult);
      setWeather(weatherResult);

      // 3. Arrhenius Engine Logic
      const k = calculateDecayRate(predResult.produce_type, weatherResult.temperature_kelvin);
      const calculatedRul = calculateRUL(predResult.quality_score, k);
      
      setRul(calculatedRul);
      setNutrients(getNutrientRetention(predResult.produce_type, predResult.quality_score));
      setRecipes(getRecommendations(predResult.produce_type, calculatedRul));
      
      // 4. Save to Firestore
      await savePrediction({
        produceType: predResult.produce_type,
        qualityScore: predResult.quality_score,
        rulHours: calculatedRul,
        temperatureK: weatherResult.temperature_kelvin,
        humidity: weatherResult.humidity_percent,
        // imageUrl: imageData // Skip storing large base64 in Firestore to avoid 1MB limit
      });

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
                <button 
                  onClick={startScanner}
                  className="w-full bg-[#1AAB5F] hover:bg-[#158a4d] text-white py-6 rounded-full flex items-center justify-center gap-3 font-bold text-lg shadow-xl shadow-green-100 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Camera size={24} />
                  New Prediction
                </button>
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
                
                <div className="grid grid-cols-2 gap-8 w-full pt-8 mt-4 border-t border-slate-50">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Temperature</span>
                    <span className="text-xl font-bold text-[#0097B2]">{(weather?.temperature_kelvin ? (weather.temperature_kelvin - 273.15).toFixed(1) : 0)}°C</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                     <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Humidity</span>
                    <span className="text-xl font-bold text-[#0097B2]">{weather?.humidity_percent}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-4xl p-8 shadow-sm border border-slate-100 space-y-6">
                <div className="flex justify-between items-end">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Info size={12} /> Nutritional Index
                  </h3>
                  <span className="text-[10px] font-bold text-slate-300 tracking-tighter uppercase">Retained Value</span>
                </div>
                <div className="space-y-4">
                  {nutrients?.nutrients.map(n => (
                    <div key={n.name} className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-slate-600 uppercase tracking-tight">{n.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">
                            {n.currentValue.toFixed(n.unit === 'mg' ? 1 : 2)}{n.unit} / {n.baseValue.toFixed(n.unit === 'mg' ? 1 : 2)}{n.unit}
                          </span>
                          <span className={`${n.percentage > 80 ? 'text-[#1AAB5F]' : n.percentage > 50 ? 'text-amber-500' : 'text-red-500'}`}>
                            {n.percentage.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100/50">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${n.percentage}%` }}
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
                     <div key={item.id} className="bg-white p-5 rounded-4xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-[#1AAB5F20] transition-all">
                       <div className="w-16 h-16 rounded-2xl bg-slate-50 flex-shrink-0 overflow-hidden border border-slate-100 shadow-inner flex items-center justify-center text-2xl">
                         {item.produceType.toLowerCase().includes('banana') ? '🍌' : 
                          item.produceType.toLowerCase().includes('tomato') ? '🍅' :
                          item.produceType.toLowerCase().includes('apple') ? '🍎' :
                          item.produceType.toLowerCase().includes('leaf') ? '🥬' : '📦'}
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center justify-between">
                           <h4 className="font-bold text-slate-800 capitalize truncate">{item.produceType.replace('_', ' ')}</h4>
                           <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{new Date(item.timestamp).toLocaleDateString()}</span>
                         </div>
                         <div className="flex items-center gap-4 mt-2">
                           <div className="flex items-center gap-1.5 text-[#1AAB5F]">
                             <Leaf size={12} fill="currentColor" />
                             <span className="text-[10px] font-bold uppercase tracking-widest">{item.rulHours.toFixed(0)}h RUL</span>
                           </div>
                           <div className="flex items-center gap-1.5 text-[#0097B2]">
                             <Thermometer size={12} />
                             <span className="text-[10px] font-bold uppercase tracking-widest">{(item.temperatureK - 273.15).toFixed(0)}°C</span>
                           </div>
                         </div>
                       </div>
                     </div>
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
    </div>
  );
}
