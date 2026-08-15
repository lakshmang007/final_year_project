/**
 * RAG Knowledge Vector Store & Upcycling Advisor
 * 
 * Simulates vector embedding similarity search (FAISS-style cosine distance)
 * for:
 * 1. Culinary zero-waste rescue recipes (freshness < 0.40)
 * 2. Precision storage advice & temperature/humidity optimization
 * 3. Micronutrient degradation telemetry & USDA nutritional profiles
 * 4. Post-decay bio-waste circular solutions (Bokashi fermentation, anaerobic composting, peel fertilizers, natural dyes)
 */

export interface KnowledgeDocument {
  id: string;
  category: 'recipe' | 'storage' | 'nutrition' | 'upcycling_compost';
  produceType: string; // 'banana', 'tomato', 'all', etc.
  title: string;
  description: string;
  actionSteps: string[];
  freshnessRange: [number, number]; // [minQuality, maxQuality] e.g. [0.0, 0.35]
  tags: string[];
}

export const KNOWLEDGE_CORPUS: KnowledgeDocument[] = [
  // --- Bananas ---
  {
    id: 'b-rec-1',
    category: 'recipe',
    produceType: 'banana',
    title: 'Caramelized Overripe Banana Loaf',
    description: 'High-sugar brown bananas yield maximum moisture and natural caramelization without refined sugars.',
    actionSteps: [
      'Mash 3 brown or freckled bananas with a fork.',
      'Fold into 2 cups flour, 1 tsp baking soda, and 1/3 cup melted butter or oil.',
      'Bake at 175°C (350°F) for 50-55 mins until a toothpick comes out clean.'
    ],
    freshnessRange: [0.15, 0.50],
    tags: ['baking', 'zero-waste', 'high-potassium']
  },
  {
    id: 'b-stor-1',
    category: 'storage',
    produceType: 'banana',
    title: 'Ethylene Crown Isolation Technique',
    description: 'Bananas emit high concentrations of ethylene gas primarily from their stem crowns.',
    actionSteps: [
      'Wrap the crown / stem tightly with beeswax wrap or aluminum foil.',
      'Separate bananas from the bunch to prevent cluster cascade ripening.',
      'Keep away from avocados, apples, and leafy greens.'
    ],
    freshnessRange: [0.50, 1.0],
    tags: ['storage', 'ethylene-control', 'shelf-extension']
  },
  {
    id: 'b-nut-1',
    category: 'nutrition',
    produceType: 'banana',
    title: 'Starch to Fructose Glycemic Conversion',
    description: 'As bananas ripen and peel turns yellow with brown spots, resistant starch converts to simple sugars.',
    actionSteps: [
      'Green/firm bananas contain high prebiotic resistant starch for gut microbiome health.',
      'Freckled yellow bananas have peaked antioxidant and bioavailable potassium levels.',
      'Brown bananas provide rapid-digesting natural glucose ideal for athletic pre-workouts.'
    ],
    freshnessRange: [0.0, 1.0],
    tags: ['nutrition', 'potassium', 'gut-health']
  },
  {
    id: 'b-comp-1',
    category: 'upcycling_compost',
    produceType: 'banana',
    title: 'Potassium & Phosphorus Liquid Plant Fertilizer',
    description: 'Banana peels are packed with potassium (K), magnesium, and calcium.',
    actionSteps: [
      'Submerge chopped banana peels in a jar of aerated water for 48-72 hours.',
      'Strain the nutrient-dense tea and dilute 1:5 with tap water.',
      'Apply to flowering plants, tomato vines, or indoor monstera to boost root strength.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['compost', 'circular-economy', 'bio-fertilizer']
  },

  // --- Tomatoes ---
  {
    id: 't-rec-1',
    category: 'recipe',
    produceType: 'tomato',
    title: 'Slow-Simmered San Marzano Style Marinara',
    description: 'Softening tomatoes release high umami glutamic acid when slowly reduced.',
    actionSteps: [
      'Coarsely dice soft or bruised tomatoes; no peeling required.',
      'Sauté with crushed garlic and extra virgin olive oil over medium-low heat for 35 minutes.',
      'Finish with fresh basil and sea salt.'
    ],
    freshnessRange: [0.15, 0.50],
    tags: ['sauce', 'savory', 'high-lycopene']
  },
  {
    id: 't-stor-1',
    category: 'storage',
    produceType: 'tomato',
    title: 'Stem-Down Room Temperature Protocol',
    description: 'Chilling below 12°C degrades volatile flavor compounds (Z-3-hexenal) and creates a mealy texture.',
    actionSteps: [
      'Store stem-side down on a breathable surface to block moisture loss and mold entry.',
      'Maintain between 15°C to 20°C (59°F - 68°F); avoid refrigerator placement unless fully sliced.'
    ],
    freshnessRange: [0.40, 1.0],
    tags: ['storage', 'temperature-control', 'flavor-preservation']
  },
  {
    id: 't-nut-1',
    category: 'nutrition',
    produceType: 'tomato',
    title: 'Thermal Lycopene Bioavailability Enhancement',
    description: 'Lycopene is an intensely potent carotenoid antioxidant linked to cellular longevity.',
    actionSteps: [
      'Cooking overripe tomatoes breaks down plant cell walls, transforming trans-lycopene into cis-isomers.',
      'Consuming with healthy lipids (olive oil) increases systemic bioavailability by over 300%.'
    ],
    freshnessRange: [0.0, 1.0],
    tags: ['nutrition', 'lycopene', 'antioxidants']
  },
  {
    id: 't-comp-1',
    category: 'upcycling_compost',
    produceType: 'tomato',
    title: 'Bokashi Anaerobic Acid Fermentation',
    description: 'Overly spoiled tomatoes with fungal mold should not be left in open vermicomposting.',
    actionSteps: [
      'Deposit spoiled tomatoes into an airtight Bokashi fermenter with EM-1 inoculant bran.',
      'The anaerobic lactic acid bacteria neutralize fungal pathogens in 14 days.',
      'Bury fermented pre-compost 8 inches deep into garden beds to regenerate soil organic matter.'
    ],
    freshnessRange: [0.0, 0.20],
    tags: ['compost', 'bokashi', 'microbial-regeneration']
  },

  // --- Avocados ---
  {
    id: 'av-rec-1',
    category: 'recipe',
    produceType: 'avocado',
    title: 'Velvety Dark Cacao Mousse',
    description: 'Overly soft avocados blend into an ultra-creamy pudding base without any detectable avocado flavor.',
    actionSteps: [
      'Blend 1 very soft avocado with 3 tbsp raw cacao powder, 2 tbsp maple syrup, and splash of almond milk.',
      'Chill in the refrigerator for 20 minutes before serving.'
    ],
    freshnessRange: [0.15, 0.45],
    tags: ['dessert', 'healthy-fats', 'dairy-free']
  },
  {
    id: 'av-stor-1',
    category: 'storage',
    produceType: 'avocado',
    title: 'Submerged Water Cold Stasis or Lemon Seal',
    description: 'Polyphenol oxidase enzyme triggers brown enzymatic oxidation upon contact with atmospheric O₂.',
    actionSteps: [
      'For uncut ripe avocados: refrigerate at 4°C to decelerate metabolism by 85%.',
      'For halved avocados: brush exposed flesh with ascorbic acid (lime juice) and press parchment flush.'
    ],
    freshnessRange: [0.35, 0.95],
    tags: ['storage', 'anti-browning', 'oxidation-prevention']
  },
  {
    id: 'av-comp-1',
    category: 'upcycling_compost',
    produceType: 'avocado',
    title: 'Avocado Seed Natural Botanical Pink Dye & Seed Charcoal',
    description: 'Avocado pits are rich in perseorangin tannins that produce permanent natural peach/pink textile dye.',
    actionSteps: [
      'Boil crushed avocado pits and peels in water for 45 minutes to extract concentrated ruby-pink dye.',
      'Soak natural cotton or linen for an eco-friendly textile dye.',
      'The spent pit fragments decompose rapidly once boiled.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['upcycling', 'natural-dye', 'zero-waste']
  },

  // --- Apples ---
  {
    id: 'ap-rec-1',
    category: 'recipe',
    produceType: 'apple',
    title: 'Spiced Pectin Apple Chutney & Compote',
    description: 'Soft or bruised apples retain high natural pectin that thickens preserves without gelatins.',
    actionSteps: [
      'Core and dice soft apples (bruised spots excised).',
      'Simmer with 1 cinnamon stick, 1 star anise, 1 tbsp apple cider vinegar, and 1 tbsp brown sugar for 25 mins.',
      'Jar and refrigerate for up to 3 weeks.'
    ],
    freshnessRange: [0.15, 0.50],
    tags: ['compote', 'pectin', 'preservation']
  },
  {
    id: 'ap-comp-1',
    category: 'upcycling_compost',
    produceType: 'apple',
    title: 'Apple Scrap Probiotic Cleaning Vinegar',
    description: 'Apple cores and peels can be fermented by acetobacter into natural acetic acid cleaner.',
    actionSteps: [
      'Fill a glass jar with apple cores, peels, 1 tbsp sugar, and filtered water.',
      'Cover with cheesecloth and let ferment at room temp for 3-4 weeks.',
      'Strain to yield pure natural apple cider vinegar for cleaning kitchen surfaces.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['fermentation', 'eco-cleaning', 'circular-waste']
  },

  // --- Leafy Greens ---
  {
    id: 'lg-rec-1',
    category: 'recipe',
    produceType: 'leafy_greens',
    title: 'Nutrient-Dense Pesto Genovese with Wilted Greens',
    description: 'Wilted spinach, arugula, and kale crisp back up when emulsion-blended with pine nuts and olive oil.',
    actionSteps: [
      'Shock wilted greens in ice water for 3 minutes to restore cellular turgor.',
      'Blend with garlic, walnuts or pine nuts, parmesan, olive oil, and pinch of sea salt.'
    ],
    freshnessRange: [0.20, 0.55],
    tags: ['pesto', 'iron-rich', 'cellular-turgor']
  },
  {
    id: 'lg-comp-1',
    category: 'upcycling_compost',
    produceType: 'leafy_greens',
    title: 'High-Nitrogen "Green" Aerobic Compost Layer',
    description: 'Decaying greens are rich in bio-nitrogen (C:N ratio ~15:1), ideal for jumpstarting compost piles.',
    actionSteps: [
      'Layer decaying greens 1:2 with dry leaves, cardboard, or sawdust ("brown" carbon layers).',
      'Maintain moisture level like a wrung-out sponge to generate thermophilic decomposition (55°C-65°C).'
    ],
    freshnessRange: [0.0, 0.25],
    tags: ['compost', 'nitrogen-ratio', 'soil-building']
  },

  // --- Universal / General ---
  {
    id: 'gen-comp-1',
    category: 'upcycling_compost',
    produceType: 'all',
    title: 'Master Carbon-Nitrogen Aerobic Composting Protocol',
    description: 'General guidelines for diverting decayed organic matter into living humus.',
    actionSteps: [
      'Maintain an ideal Carbon (Browns) to Nitrogen (Greens) balance of roughly 30:1 by volume.',
      'Aerate weekly by turning the heap to sustain aerobic actinomycetes and prevent sulfur odors.',
      'Finished compost should smell like a fresh forest floor with a dark, crumbly loam structure.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['compost', 'aerobic', 'soil-regeneration']
  }
];

/**
 * Fast simulated embedding & semantic similarity scorer
 * Computes semantic similarity based on token overlap + category weights + freshness window.
 */
function scoreDocumentMatch(
  doc: KnowledgeDocument, 
  queryType: string, 
  qualityScore: number, 
  preferredCategory?: string
): number {
  let score = 0;

  // 1. Produce Type match
  const normalizedDocType = doc.produceType.toLowerCase();
  const normalizedQueryType = queryType.toLowerCase();
  if (normalizedDocType === normalizedQueryType) {
    score += 50;
  } else if (normalizedDocType === 'all') {
    score += 20;
  } else if (
    (normalizedDocType.includes('leaf') && normalizedQueryType.includes('leaf')) ||
    (normalizedDocType.includes('citrus') && ['lemon', 'orange', 'lime'].includes(normalizedQueryType))
  ) {
    score += 35;
  } else {
    // Different produce type, low baseline
    score -= 30;
  }

  // 2. Freshness Range proximity
  const [minQ, maxQ] = doc.freshnessRange;
  if (qualityScore >= minQ && qualityScore <= maxQ) {
    score += 30;
  } else {
    const dist = Math.min(Math.abs(qualityScore - minQ), Math.abs(qualityScore - maxQ));
    score += Math.max(0, 20 - dist * 40);
  }

  // 3. Category match bonus
  if (preferredCategory && doc.category === preferredCategory) {
    score += 25;
  }

  // 4. Overripe/Decay urgency check
  if (qualityScore < 0.30 && doc.category === 'upcycling_compost') {
    score += 25;
  } else if (qualityScore >= 0.25 && qualityScore <= 0.60 && doc.category === 'recipe') {
    score += 20;
  } else if (qualityScore > 0.60 && doc.category === 'storage') {
    score += 20;
  }

  return score;
}

/**
 * queryRAGKnowledgeBase
 * 
 * Retrieves the most relevant knowledge documents for a given produce scan.
 */
export function queryRAGKnowledgeBase(
  produceType: string, 
  qualityScore: number, 
  category?: 'recipe' | 'storage' | 'nutrition' | 'upcycling_compost',
  limit: number = 3
): KnowledgeDocument[] {
  const scored = KNOWLEDGE_CORPUS.map(doc => ({
    doc,
    score: scoreDocumentMatch(doc, produceType, qualityScore, category)
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.doc);
}
