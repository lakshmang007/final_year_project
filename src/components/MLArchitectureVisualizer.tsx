/**
 * MLArchitectureVisualizer Component
 * 
 * Interactive Deep-Dive View showcasing the 5 core AI/ML pillars requested by the user:
 * 1. YOLOv8 / YOLOv11 Segmentor (Blemish & Crop)
 * 2. CNN (ConvNeXt) + ViT (SigLIP) Hybrid Backbone
 * 3. LLaVA-1.5 + LoRA/PEFT with Transformers & CUDA Acceleration (BF16/FP16)
 * 4. XGBoost / LightGBM Multi-Sensor Tabular Fusion
 * 5. FAISS RAG Retrieval Engine
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Cpu, 
  Layers, 
  Terminal, 
  Zap, 
  GitBranch, 
  Gauge, 
  Database, 
  CheckCircle2, 
  Sliders, 
  Sparkles,
  Search,
  Maximize2
} from 'lucide-react';
import { runPipelineBenchmark, ModelBenchmarkResult } from '../lib/mlArchitecture';

interface MLArchitectureVisualizerProps {
  produceType: string;
  qualityScore: number;
  temperatureK: number;
  humidity: number;
  rulHours: number;
}

type ModelTab = 'all' | 'yolo' | 'llava_lora' | 'xgboost' | 'cuda_bf16';

export function MLArchitectureVisualizer({
  produceType,
  qualityScore,
  temperatureK,
  humidity,
  rulHours
}: MLArchitectureVisualizerProps) {
  const [selectedTab, setSelectedTab] = useState<ModelTab>('all');
  const [showCodeSnippet, setShowCodeSnippet] = useState<boolean>(false);

  const benchmark: ModelBenchmarkResult = runPipelineBenchmark(
    produceType,
    qualityScore,
    temperatureK,
    humidity
  );

  return (
    <div className="bg-white rounded-4xl p-6 sm:p-8 shadow-sm border border-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Cpu size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              PyTorch • LLaVA • CUDA • XGBoost Neural Architecture
              <span className="text-[9px] bg-purple-100 text-purple-700 font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                BF16 / LoRA
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 font-medium">
              Multi-stage inference telemetry: YOLO $\to$ CNN $\to$ LLaVA $\to$ XGBoost $\to$ FAISS
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCodeSnippet(!showCodeSnippet)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 active:scale-95"
        >
          <Terminal size={13} className="text-purple-600" />
          <span>{showCodeSnippet ? 'Hide PyTorch Code' : 'View PyTorch Code'}</span>
        </button>
      </div>

      {/* Real-Time Hardware & CUDA Telemetry Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>CUDA Latency</span>
            <Zap size={12} className="text-amber-400" />
          </div>
          <div className="text-lg font-black text-amber-400 font-mono">
            {benchmark.cudaTotalLatencyMs} <span className="text-xs text-slate-400 font-normal">ms</span>
          </div>
          <div className="text-[10px] text-slate-400">Total 5-stage inference</div>
        </div>

        <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>GPU VRAM (BF16)</span>
            <Gauge size={12} className="text-cyan-400" />
          </div>
          <div className="text-lg font-black text-cyan-300 font-mono">
            {(benchmark.cudaVramAllocatedMb / 1024).toFixed(2)} <span className="text-xs text-slate-400 font-normal">GB</span>
          </div>
          <div className="text-[10px] text-slate-400">NF4 Quantized + LoRA</div>
        </div>

        <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>LoRA Parameters</span>
            <GitBranch size={12} className="text-emerald-400" />
          </div>
          <div className="text-lg font-black text-emerald-400 font-mono">
            {benchmark.loraTrainableParamsPct}% <span className="text-xs text-slate-400 font-normal">trainable</span>
          </div>
          <div className="text-[10px] text-slate-400">Rank $r=16$, $\alpha=32$</div>
        </div>

        <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <span>XGBoost + RAG</span>
            <Database size={12} className="text-purple-400" />
          </div>
          <div className="text-lg font-black text-purple-300 font-mono">
            {benchmark.xgboostCalculatedRul} <span className="text-xs text-slate-400 font-normal">hrs</span>
          </div>
          <div className="text-[10px] text-slate-400">Physics tabular fusion</div>
        </div>
      </div>

      {/* Model Filter Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-50 rounded-2xl border border-slate-100 text-xs font-bold">
        {[
          { id: 'all', label: 'All Layers' },
          { id: 'yolo', label: 'YOLO + CNN' },
          { id: 'llava_lora', label: 'LLaVA + LoRA' },
          { id: 'xgboost', label: 'XGBoost Fusion' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id as ModelTab)}
            className={`py-2 px-2 rounded-xl transition-all text-center ${
              selectedTab === tab.id
                ? 'bg-white text-slate-800 shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pipeline Stage Cards */}
      <div className="space-y-3">
        {benchmark.layers
          .filter(layer => {
            if (selectedTab === 'all') return true;
            if (selectedTab === 'yolo') return layer.type === 'YOLOv11-Seg' || layer.type === 'ConvNeXt-CNN';
            if (selectedTab === 'llava_lora') return layer.type === 'LLaVA-LoRA';
            if (selectedTab === 'xgboost') return layer.type === 'XGBoost-Regressor' || layer.type === 'FAISS-RAG';
            if (selectedTab === 'cuda_bf16') return layer.device.includes('CUDA');
            return true;
          })
          .map((layer, idx) => (
            <div 
              key={idx}
              className="p-4 rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-all space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-purple-100 text-purple-700 font-mono text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <h4 className="text-xs font-bold text-slate-800">{layer.name}</h4>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono font-bold bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-md">
                    {layer.device}
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md">
                    {layer.precision}
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                    {layer.latencyMs} ms
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed font-mono">
                {layer.outputDescription}
              </p>
            </div>
          ))}
      </div>

      {/* Code Snippet Modal / Drawer */}
      {showCodeSnippet && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-slate-950 text-slate-200 rounded-3xl p-5 border border-slate-800 font-mono text-[11px] space-y-3 overflow-x-auto"
        >
          <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
            <span className="text-emerald-400 font-bold"># biofresh_pytorch_pipeline.py</span>
            <span className="text-[10px] text-slate-500">PyTorch 2.3 + HuggingFace TRL</span>
          </div>

          <pre className="text-slate-300 leading-relaxed">
{`import torch
import torch.nn as nn
from ultralytics import YOLO
from transformers import LlavaForConditionalGeneration, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model
import xgboost as xgb
import faiss

# 1. Device & BF16 Mixed Precision
device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

# 2. YOLOv11 Surface Blemish Segmentation
yolo = YOLO("yolov11x-seg.pt").to(device)
yolo_crop, blemish_pct = yolo(image_tensor)

# 3. LLaVA-1.5 + LoRA in 4-bit NF4
bnb_cfg = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=dtype)
llava = LlavaForConditionalGeneration.from_pretrained("llava-hf/llava-1.5-7b-hf", quantization_config=bnb_cfg)
lora_cfg = LoraConfig(r=16, lora_alpha=32, target_modules=["q_proj", "v_proj"], task_type="CAUSAL_LM")
peft_model = get_peft_model(llava, lora_cfg)

with torch.autocast(device_type="cuda", dtype=dtype):
    vlm_output = peft_model.generate(**inputs) # Visual Quality Q0

# 4. XGBoost Arrhenius Sensor Fusion
xgb_model = xgb.XGBRegressor().load_model("arrhenius_xgb.json")
rul_hours = xgb_model.predict([[Q0, blemish_pct, temp_K, humidity_pct]])

# 5. FAISS RAG Retrieval
distances, indices = faiss_index.search(query_embedding, k=4)`}
          </pre>
        </motion.div>
      )}
    </div>
  );
}
