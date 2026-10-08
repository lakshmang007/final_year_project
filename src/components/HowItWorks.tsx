/**
 * "How it works" tab
 *
 * In simple words:
 * Explains, with the real numbers from THIS scan, what the app did with the photo:
 * the trained vision model, the freshness score, the feedback memory, and the Arrhenius
 * shelf-life calculation. The "About the model" card shows the real training and test
 * results from models/metrics.json (served by GET /api/model/info). No made-up figures.
 */
import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Brain, Leaf, Users, Thermometer, Sparkles, Database, AlertTriangle } from 'lucide-react';
import { PRODUCE_DATA, calculateDecayRate } from '../lib/science';
import { getModelInfo, ModelInfo, AlternativeCandidate } from '../services/api';

interface Props {
  produceType: string;
  qualityScore: number;
  confidence?: number;
  freshnessReliable?: boolean;
  source?: 'model' | 'feedback';
  matchedSimilarity?: number;
  alternatives?: AlternativeCandidate[];
  rulHours: number;
  temperatureK: number;
  storage: string;
}

const pretty = (s: string) => s.replace(/_/g, ' ');
const pct = (x?: number | null) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);

export function HowItWorks(p: Props) {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  useEffect(() => { getModelInfo().then(setInfo).catch(() => setInfo(null)); }, []);

  const meta = PRODUCE_DATA[p.produceType];
  const k = calculateDecayRate(p.produceType, p.temperatureK);
  const tempC = p.temperatureK - 273.15;
  const m = info?.metrics;
  const produceTypes = info?.labels?.classes?.filter(c => c !== 'not_produce').length;

  const steps = [
    {
      icon: ImageIcon, title: 'Photo prepared',
      text: 'Resized to 224 × 224 pixels and analysed as 3 views (whole photo, zoomed-in centre, mirrored). The 3 answers are averaged so one bad crop matters less.',
    },
    {
      icon: Brain, title: 'Vision model identifies the item',
      text: <>EfficientNet-B0 neural network, trained on Kaggle photos (see below): <b>{pretty(p.produceType)}</b>
        {p.confidence != null && <> with <b>{Math.round(p.confidence * 100)}%</b> confidence</>}.
        {p.alternatives?.length ? <> Next guesses: {p.alternatives.map(a => `${a.label} (${a.reason?.match(/[\d.]+%/)?.[0] ?? ''})`).join(', ')}.</> : null}</>,
    },
    {
      icon: Leaf, title: 'Freshness score',
      text: p.freshnessReliable === false
        ? <>This type had no fresh/rotten training photos, so freshness is <b>not measured</b>; the app assumes <b>{Math.round(p.qualityScore * 100)}%</b>.</>
        : <>The same network's freshness output: <b>{Math.round(p.qualityScore * 100)}%</b> probability that the item is fresh (0% = rotten). This becomes the quality <i>Q</i>.</>,
    },
    {
      icon: Users, title: 'Feedback memory',
      text: p.source === 'feedback'
        ? <>A photo that a user already corrected was <b>{Math.round((p.matchedSimilarity ?? 0) * 100)}% similar</b>, so the user's label was used.</>
        : 'Compared with photos users corrected earlier ("Is this correct? No"). No close match, so the model\'s answer was kept.',
    },
    {
      icon: Thermometer, title: 'Shelf life (Arrhenius kinetics)',
      text: <>
        Decay rate <i>k = A · e<sup>−Ea / (R·T)</sup></i> with A = {meta ? meta.A.toExponential(2) : 'default'}, Ea = {(meta?.Ea ?? 60000) / 1000} kJ/mol,
        R = 8.314, T = {p.temperatureK.toFixed(2)} K ({tempC.toFixed(1)}°C, {p.storage === 'refrigerator' ? 'fridge' : p.storage}).
        So <i>k</i> = {k.toExponential(3)} per hour and remaining life = Q / k = {p.qualityScore.toFixed(2)} / {k.toExponential(2)} ≈ <b>{Math.round(p.rulHours)} hours</b>.
      </>,
    },
    {
      icon: Sparkles, title: 'AI Assistant (optional)',
      text: 'On the ✨ AI tab, Google Gemini writes recipes grounded in the knowledge base (generative AI + RAG), and the Kitchen Rescue Agent plans across all your scans by calling tools (agentic AI).',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">What happened to this photo</h3>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-8 h-8 rounded-xl bg-teal-50 text-[#0097B2] flex items-center justify-center"><s.icon size={16} /></span>
              <div>
                <p className="text-xs font-bold text-slate-800">{i + 1}. {s.title}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5"><Database size={14} className="text-[#0097B2]" /> About the model</h3>
        {!m ? <p className="text-xs text-slate-500">Loading model details…</p> : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Types recognised', `${produceTypes} + "not produce"`],
                ['Training photos', m.train_images?.toLocaleString()],
                ['Type accuracy (held-out test)', pct(m.test_type_accuracy)],
                ['Fresh vs rotten accuracy', pct(m.test_freshness_accuracy)],
                ['Web photos, same sources as training', pct(m.test_real_world_type_accuracy)],
                ['Independent real-world check', m.independent_eval ? `${pct(m.independent_eval.produce_top1)} correct, ${pct(m.independent_eval.produce_top3)} in top 3` : 'not run'],
              ].map(([label, value]) => (
                <div key={label} className="bg-slate-50 rounded-2xl p-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-500">{label}</p>
                  <p className="text-sm font-bold text-slate-800">{value ?? '–'}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">
              Trained {m.trained_at} on {Object.keys(m.datasets || {}).length} Kaggle datasets: {Object.keys(m.datasets || {}).map(d => d.split('/')[1]).join(', ')}.
            </p>
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {m.independent_eval ? `The independent check used ${m.independent_eval.produce_images} everyday produce photos and ${m.independent_eval.not_produce_images} non-produce photos from Wikimedia Commons that were never used in training (${pct(m.independent_eval.not_produce_rejected)} of non-produce correctly rejected). ` : ''}
              Accuracy on everyday phone photos is lower than on clean dataset photos. If the result is wrong, tap "No, it's wrong": the app remembers your correction.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
