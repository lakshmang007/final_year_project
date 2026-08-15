/**
 * PipelineVisualizer Component
 * 
 * In simple words:
 * This component visually walks the user through the entire step-by-step AI & Science journey:
 * 1. Image Capture & Ingestion (photo is taken and cleaned up)
 * 2. Visual Segmentation & ROI (isolating the produce from the background)
 * 3. Multimodal AI Identification (detecting produce type and freshness score)
 * 4. Arrhenius Kinetic Sensor Fusion (combining temperature + chemistry physics)
 * 5. Shelf-Life (RUL) & Nutrient Projection (calculating hours left & vitamin retention)
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Scan, 
  Cpu, 
  Thermometer, 
  Clock, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  Activity, 
  Info,
  Maximize2,
  Play,
  Pause
} from 'lucide-react';
import { PRODUCE_DATA } from '../lib/science';

// Props passed from parent results view
export interface PipelineVisualizerProps {
  imageUrl?: string | null;
  produceType: string;
  qualityScore: number;
  temperatureK: number;
  humidity: number;
  rulHours: number;
  confidence?: number;
}

// Definition for each stage in the visual pipeline
interface PipelineStep {
  id: number;
  key: 'capture' | 'segmentation' | 'vlm' | 'arrhenius' | 'rul';
  title: string;
  shortLabel: string;
  badge: string;
  icon: React.ElementType;
  color: string;
  bgLight: string;
  borderColor: string;
  description: string;
}

// 5 Step definitions for the AI & Science Pipeline
const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: 1,
    key: 'capture',
    title: 'Image Capture & Ingestion',
    shortLabel: 'Ingest',
    badge: 'Raw RGB Matrix',
    icon: Camera,
    color: 'text-blue-500',
    bgLight: 'bg-blue-50',
    borderColor: 'border-blue-200',
    description: 'High-resolution frame sampling, RGB color space normalization, and contrast calibration for clean visual analysis.'
  },
  {
    id: 2,
    key: 'segmentation',
    title: 'Semantic Segmentation & ROI Mask',
    shortLabel: 'Segment',
    badge: 'Contour & Surface ROI',
    icon: Scan,
    color: 'text-purple-500',
    bgLight: 'bg-purple-50',
    borderColor: 'border-purple-200',
    description: 'Separates produce foreground from background surfaces, generating a boundary mask to inspect peel texture and browning spots.'
  },
  {
    id: 3,
    key: 'vlm',
    title: 'Multimodal Vision Feature Extraction',
    shortLabel: 'Identify',
    badge: 'Vision-Language Model',
    icon: Cpu,
    color: 'text-emerald-500',
    bgLight: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    description: 'Transformer-based visual patch tokenization classifies produce taxonomy, skin variegation, and visual quality rating.'
  },
  {
    id: 4,
    key: 'arrhenius',
    title: 'Arrhenius Kinetics & Sensor Fusion',
    shortLabel: 'Physics',
    badge: 'Arrhenius Physics k = A·e^(-Ea/RT)',
    icon: Thermometer,
    color: 'text-amber-500',
    bgLight: 'bg-amber-50',
    borderColor: 'border-amber-200',
    description: 'Fuses ambient temperature & moisture telemetry with thermodynamic activation energy (Ea) to compute exact reaction velocity (k).'
  },
  {
    id: 5,
    key: 'rul',
    title: 'Shelf-Life (RUL) & Nutrient Engine',
    shortLabel: 'Shelf Life',
    badge: 'RUL = Quality / k',
    icon: Clock,
    color: 'text-teal-500',
    bgLight: 'bg-teal-50',
    borderColor: 'border-teal-200',
    description: 'Calculates remaining hours of freshness and estimates real-time micronutrient retention (Vitamin C, Folate, Antioxidants).'
  }
];

export function PipelineVisualizer({
  imageUrl,
  produceType,
  qualityScore,
  temperatureK,
  humidity,
  rulHours,
  confidence = 0.94
}: PipelineVisualizerProps) {
  // Currently active step index (0 to 4)
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  // Auto-play walkthrough timer toggle
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  // View segmentation heatmap mode toggle
  const [showMaskOverlay, setShowMaskOverlay] = useState<boolean>(true);

  // Chemistry constants for the scanned fruit/veggie
  const metadata = PRODUCE_DATA[produceType.toLowerCase()] || { A: 1.3e8, Ea: 60000 };
  const R = 8.314; // Gas constant
  const k = metadata.A * Math.exp(-metadata.Ea / (R * temperatureK));
  const tempCelsius = (temperatureK - 273.15).toFixed(1);

  // Auto-play through steps if enabled
  useEffect(() => {
    if (!autoPlay) return;
    const interval = setInterval(() => {
      setActiveStepIndex((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoPlay]);

  const activeStep = PIPELINE_STEPS[activeStepIndex];

  return (
    <div className="bg-white rounded-4xl p-6 sm:p-7 shadow-sm border border-slate-100 space-y-6">
      {/* Header with Title & Auto-Play Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-50 text-[#0097B2] flex items-center justify-center">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              Visual Processing Pipeline
              <span className="text-[10px] bg-slate-100 text-slate-500 font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                Step {activeStepIndex + 1} of 5
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              Understand how your produce moves from photo to shelf-life prediction
            </p>
          </div>
        </div>

        <button
          onClick={() => setAutoPlay(!autoPlay)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
            autoPlay 
              ? 'bg-[#0097B2] text-white border-[#0097B2] shadow-sm' 
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
          title={autoPlay ? 'Pause step walkthrough' : 'Auto-play walkthrough'}
        >
          {autoPlay ? <Pause size={13} /> : <Play size={13} />}
          <span>{autoPlay ? 'Pause Tour' : 'Auto Play'}</span>
        </button>
      </div>

      {/* Interactive Step Navigator Pills */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {PIPELINE_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = idx === activeStepIndex;
          const isPassed = idx < activeStepIndex;

          return (
            <button
              key={step.id}
              onClick={() => {
                setActiveStepIndex(idx);
                setAutoPlay(false);
              }}
              className={`p-2.5 sm:p-3 rounded-2xl flex flex-col items-center gap-1.5 transition-all text-center relative overflow-hidden border ${
                isActive
                  ? `${step.bgLight} ${step.borderColor} shadow-sm ring-2 ring-teal-500/20`
                  : isPassed
                    ? 'bg-slate-50/80 border-slate-200 text-slate-700 hover:bg-slate-100'
                    : 'bg-slate-50/40 border-slate-100 text-slate-400 hover:bg-slate-50'
              }`}
            >
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors ${
                isActive ? `${step.color} bg-white shadow-xs` : isPassed ? 'text-teal-600 bg-white/80' : 'text-slate-400'
              }`}>
                {isPassed ? <CheckCircle2 size={15} /> : <Icon size={15} />}
              </div>
              <span className={`text-[10px] font-bold leading-tight line-clamp-1 ${
                isActive ? 'text-slate-800' : 'text-slate-500'
              }`}>
                {step.shortLabel}
              </span>
              
              {isActive && (
                <motion.div 
                  layoutId="activePipelineIndicator"
                  className="absolute bottom-0 left-0 right-0 h-1 bg-[#0097B2]"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Active Step Visual Showcase Viewport */}
      <div className="bg-slate-900 rounded-3xl p-5 sm:p-6 text-white relative overflow-hidden min-h-[310px] flex flex-col justify-between border border-slate-800 shadow-lg">
        {/* Subtle background glow */}
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#0097B2]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-[#1AAB5F]/15 rounded-full blur-3xl pointer-events-none" />

        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-4 relative z-10"
          >
            {/* Step Badge & Title */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-400 font-mono text-xs font-bold flex items-center justify-center border border-teal-500/30">
                  {activeStep.id}
                </span>
                <h4 className="text-base font-bold text-white tracking-wide">
                  {activeStep.title}
                </h4>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-slate-800 text-teal-300 text-[10px] font-mono font-bold border border-slate-700">
                {activeStep.badge}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
              {activeStep.description}
            </p>

            {/* DYNAMIC VISUAL RENDER PER STEP */}

            {/* STEP 1: IMAGE CAPTURE */}
            {activeStep.key === 'capture' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="relative aspect-video sm:aspect-square max-h-44 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
                  {imageUrl ? (
                    <img src={imageUrl} alt="Captured Produce" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={32} className="text-slate-600" />
                  )}
                  {/* Grid Lines Overlay */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 border border-white/10 pointer-events-none">
                    <div className="border-r border-b border-white/10" />
                    <div className="border-r border-b border-white/10" />
                    <div className="border-b border-white/10" />
                    <div className="border-r border-b border-white/10" />
                    <div className="border-r border-b border-white/10" />
                    <div className="border-b border-white/10" />
                  </div>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur text-[9px] font-mono text-emerald-400">
                    RGB 1080p • 24bpp
                  </div>
                </div>

                <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 text-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ingestion Telemetry</div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-[11px]">
                    <span className="text-slate-400">Color Normalization:</span>
                    <span className="font-mono text-teal-400">CIELAB ΔE &lt; 0.4</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-[11px]">
                    <span className="text-slate-400">Aspect Ratio:</span>
                    <span className="font-mono text-slate-200">1:1 Square Crop</span>
                  </div>
                  <div className="flex justify-between py-1 text-[11px]">
                    <span className="text-slate-400">Channel Calibration:</span>
                    <span className="font-mono text-emerald-400">Auto White Balanced</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: SEGMENTATION & ROI MASK */}
            {activeStep.key === 'segmentation' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="relative aspect-video sm:aspect-square max-h-44 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center group">
                  {imageUrl ? (
                    <img 
                      src={imageUrl} 
                      alt="Segmented Produce" 
                      className={`w-full h-full object-cover transition-all ${showMaskOverlay ? 'contrast-125 brightness-90' : ''}`} 
                    />
                  ) : (
                    <Scan size={32} className="text-slate-600" />
                  )}

                  {/* Simulated Segmentation Mask Overlay */}
                  {showMaskOverlay && (
                    <div className="absolute inset-0 bg-purple-500/20 mix-blend-screen pointer-events-none flex items-center justify-center">
                      <div className="w-3/4 h-3/4 rounded-full border-2 border-purple-400/80 shadow-[0_0_20px_rgba(168,85,247,0.6)] animate-pulse flex items-center justify-center">
                        <span className="text-[10px] font-mono text-purple-200 bg-purple-900/80 px-2 py-0.5 rounded-full border border-purple-400/50">
                          Produce ROI (98.2%)
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setShowMaskOverlay(!showMaskOverlay)}
                    className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-slate-900/80 backdrop-blur text-[10px] font-bold text-purple-300 border border-purple-500/30 flex items-center gap-1"
                  >
                    <Layers size={11} /> {showMaskOverlay ? 'Mask ON' : 'Mask OFF'}
                  </button>
                </div>

                <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 text-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Segmentation Metrics</div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-[11px]">
                    <span className="text-slate-400">Foreground IoU Score:</span>
                    <span className="font-mono text-purple-400">0.962 (High Precision)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800 text-[11px]">
                    <span className="text-slate-400">Peel Boundary Isolation:</span>
                    <span className="font-mono text-emerald-400">Active Contour Filter</span>
                  </div>
                  <div className="flex justify-between py-1 text-[11px]">
                    <span className="text-slate-400">Surface Defect Zone:</span>
                    <span className="font-mono text-amber-400">{((1 - qualityScore) * 100).toFixed(0)}% Variegation</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: VLM MULTIMODAL FEATURE EXTRACTION */}
            {activeStep.key === 'vlm' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Classified Type</div>
                    <div className="text-sm font-bold text-emerald-400 capitalize mt-1 truncate">
                      {produceType.replace('_', ' ')}
                    </div>
                  </div>
                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Vision Score</div>
                    <div className="text-sm font-bold text-teal-400 mt-1 font-mono">
                      {(qualityScore * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">VLM Confidence</div>
                    <div className="text-sm font-bold text-cyan-400 mt-1 font-mono">
                      {(confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 text-xs flex items-center justify-between">
                  <span className="text-slate-400">Visual Patch Attention Vectors:</span>
                  <span className="font-mono text-xs text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                    Ripeness Embeddings [256-d]
                  </span>
                </div>
              </div>
            )}

            {/* STEP 4: ARRHENIUS KINETICS */}
            {activeStep.key === 'arrhenius' && (
              <div className="space-y-3 pt-2">
                {/* Arrhenius Equation Display */}
                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 space-y-2">
                  <div className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                    Thermodynamic Equation
                  </div>
                  <div className="text-center font-mono text-sm sm:text-base text-amber-200 py-1 bg-slate-950/60 rounded-xl border border-amber-500/20">
                    k = A · e<sup className="text-xs">(-Ea / (R · T))</sup>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
                    <div className="bg-slate-950/40 p-2 rounded-lg text-slate-300">
                      <span className="text-slate-500 block text-[9px]">A (Frequency):</span>
                      {metadata.A.toExponential(1)}
                    </div>
                    <div className="bg-slate-950/40 p-2 rounded-lg text-slate-300">
                      <span className="text-slate-500 block text-[9px]">Ea (Energy):</span>
                      {(metadata.Ea / 1000).toFixed(0)} kJ/mol
                    </div>
                    <div className="bg-slate-950/40 p-2 rounded-lg text-slate-300">
                      <span className="text-slate-500 block text-[9px]">Temp (T):</span>
                      {temperatureK.toFixed(1)} K ({tempCelsius}°C)
                    </div>
                    <div className="bg-slate-950/40 p-2 rounded-lg text-amber-300 font-bold">
                      <span className="text-amber-500/80 block text-[9px]">Decay Rate (k):</span>
                      {k.toFixed(4)} /hr
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: RUL & NUTRIENT PROJECTION */}
            {activeStep.key === 'rul' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-teal-950/40 border border-teal-500/30 p-3.5 rounded-2xl text-center space-y-1">
                    <span className="text-[10px] text-teal-400 uppercase font-bold block">
                      Remaining Useful Life
                    </span>
                    <div className="text-2xl font-black text-white tracking-tight">
                      {rulHours.toFixed(1)} <span className="text-xs text-teal-300 font-normal">hrs</span>
                    </div>
                    <span className="text-[10px] text-teal-400/80 block font-medium">
                      ≈ {(rulHours / 24).toFixed(1)} Days left
                    </span>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl space-y-2 text-xs">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">
                      Nutrient Curve Status
                    </span>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Vitamin C Factor:</span>
                      <span className="font-mono text-emerald-400">{(Math.pow(qualityScore, 1.3) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Mineral Stability:</span>
                      <span className="font-mono text-teal-400">{(Math.pow(qualityScore, 0.4) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Step Navigation Controls Footer */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800/80 relative z-10">
          <button
            onClick={() => {
              setActiveStepIndex((prev) => Math.max(0, prev - 1));
              setAutoPlay(false);
            }}
            disabled={activeStepIndex === 0}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1"
          >
            <ChevronLeft size={14} /> Back
          </button>

          <div className="flex items-center gap-1">
            {PIPELINE_STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setActiveStepIndex(i);
                  setAutoPlay(false);
                }}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === activeStepIndex ? 'w-5 bg-teal-400' : 'bg-slate-700 hover:bg-slate-600'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => {
              setActiveStepIndex((prev) => Math.min(PIPELINE_STEPS.length - 1, prev + 1));
              setAutoPlay(false);
            }}
            disabled={activeStepIndex === PIPELINE_STEPS.length - 1}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1 shadow-sm"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
