/**
 * RAGKnowledgeAdvisor Component
 * 
 * Interactive smart assistant that surfaces vector-retrieved domain intelligence:
 * 1. Zero-Waste Culinary Recipes
 * 2. Optimal Storage Conditions (Arrhenius & Ethylene control)
 * 3. Micronutrient Conversion & Glycemic Insights
 * 4. Bio-Waste Circular Solutions (Bokashi fermentation, compost layers, peel fertilizers, botanical dyes)
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Utensils, 
  ThermometerSnowflake, 
  Activity, 
  Recycle, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  Lightbulb, 
  Leaf, 
  ExternalLink 
} from 'lucide-react';
import { queryRAGKnowledgeBase, KnowledgeDocument } from '../lib/ragKnowledge';

export interface RAGKnowledgeAdvisorProps {
  produceType: string;
  qualityScore: number;
  rulHours: number;
}

type TabCategory = 'recipe' | 'storage' | 'nutrition' | 'upcycling_compost';

export function RAGKnowledgeAdvisor({ produceType, qualityScore, rulHours }: RAGKnowledgeAdvisorProps) {
  const [activeTab, setActiveTab] = useState<TabCategory>(() => {
    if (qualityScore < 0.30) return 'upcycling_compost';
    if (rulHours < 24) return 'recipe';
    return 'storage';
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Retrieve top 3 relevant documents for this specific scan state
  const docs = queryRAGKnowledgeBase(produceType, qualityScore, activeTab, 4);

  const tabs: { id: TabCategory; label: string; icon: React.ElementType; badge?: string }[] = [
    { id: 'storage', label: 'Storage', icon: ThermometerSnowflake },
    { 
      id: 'recipe', 
      label: 'Recipes', 
      icon: Utensils, 
      badge: rulHours < 24 ? 'Urgent' : undefined 
    },
    { id: 'nutrition', label: 'Nutrition', icon: Activity },
    { 
      id: 'upcycling_compost', 
      label: 'Compost', 
      icon: Recycle,
      badge: qualityScore < 0.30 ? 'Circular' : undefined
    },
  ];

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-sm border border-slate-100 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-50 text-[#0097B2] flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">
                BioFresh RAG Knowledge Engine
              </h3>
              <span className="text-[9px] bg-teal-50 text-[#0097B2] px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider border border-teal-100">
                FAISS Embeddings
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Verified USDA storage protocols, culinary rescue & composting guides
            </p>
          </div>
        </div>
      </div>

      {/* Tabs with full labels without truncation */}
      <div className="grid grid-cols-4 gap-1.5 bg-slate-50 p-1 rounded-2xl border border-slate-100">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setExpandedId(null);
              }}
              className={`py-2 px-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 relative ${
                isSelected 
                  ? 'bg-white text-slate-800 shadow-xs border border-slate-200/80' 
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
              }`}
            >
              <Icon size={13} className={isSelected ? 'text-[#0097B2]' : 'text-slate-400'} />
              <span className="whitespace-nowrap">{tab.label}</span>
              {tab.badge && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[8px] font-extrabold uppercase">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Knowledge Cards with complete untruncated text */}
      <div className="space-y-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {docs.map((doc) => {
              const isExpanded = expandedId === doc.id;
              return (
                <div 
                  key={doc.id}
                  className={`border rounded-2xl transition-all overflow-hidden ${
                    isExpanded 
                      ? 'border-[#0097B2]/40 bg-teal-50/20 shadow-xs' 
                      : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                    className="w-full p-4 text-left flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#0097B2] bg-white px-2 py-0.5 rounded-md border border-[#0097B2]/20 whitespace-nowrap">
                          {doc.category.replace('_', ' ')}
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
                          {doc.title}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {doc.description}
                      </p>
                    </div>

                    <div className="pt-1 text-slate-400 shrink-0">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </button>

                  {/* Expanded Action Steps */}
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-4 pb-4 pt-1 border-t border-slate-100/80 space-y-3"
                    >
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Protocol Execution Steps:
                      </div>
                      <div className="space-y-2">
                        {doc.actionSteps.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                            <span className="w-5 h-5 rounded-full bg-[#1AAB5F]/10 text-[#1AAB5F] font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </div>
                        ))}
                      </div>

                      {/* Tag badges */}
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {doc.tags.map(t => (
                          <span key={t} className="text-[10px] font-medium text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-100">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
