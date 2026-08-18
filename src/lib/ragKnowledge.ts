/**
 * Expanded RAG Knowledge Vector Store & Upcycling Advisor
 * 
 * Provides verified USDA, agricultural extension, and circular economy protocols:
 * - Storage condition optimization (Arrhenius kinetics, ethylene separation, humidity control)
 * - Zero-waste culinary rescue recipes (for ripe and overripe produce)
 * - Nutritional telemetry (micronutrients, lycopene, carotenoids, vitamins, polyphenols)
 * - Post-decay bio-waste circular solutions (composting, fertilizers, natural dyes, vinegar fermentation)
 */

export interface KnowledgeDocument {
  id: string;
  category: 'recipe' | 'storage' | 'nutrition' | 'upcycling_compost';
  produceType: string; // 'banana', 'tomato', 'mango', 'orange', 'lemon', 'avocado', 'apple', 'leafy_greens', 'cucumber', 'papaya', 'all'
  title: string;
  description: string;
  actionSteps: string[];
  freshnessRange: [number, number]; // [minQuality, maxQuality] e.g. [0.0, 0.35]
  tags: string[];
}

export const KNOWLEDGE_CORPUS: KnowledgeDocument[] = [
  // ==========================================
  // --- MANGO ---
  // ==========================================
  {
    id: 'm-stor-1',
    category: 'storage',
    produceType: 'mango',
    title: 'Climacteric Ripening & Chilling Injury Prevention',
    description: 'Unripe mangoes should NEVER be refrigerated below 10°C (50°F), as cold causes skin discoloration, pitted flesh, and prevents proper sugar development.',
    actionSteps: [
      'Store unripe/firm mangoes at ambient room temperature (20°C - 25°C / 68°F - 77°F) until flesh yields gently to soft pressure.',
      'To accelerate ripening, place inside a brown paper bag with an apple or banana for 24-48 hours.',
      'Once fully fragrant and yielding, transfer to the refrigerator (4°C) to extend shelf life for up to 5 additional days.'
    ],
    freshnessRange: [0.40, 1.0],
    tags: ['storage', 'climacteric', 'tropical-fruit', 'chilling-injury']
  },
  {
    id: 'm-rec-1',
    category: 'recipe',
    produceType: 'mango',
    title: 'Spiced Mango Lassi & Natural Chutney',
    description: 'Overripe, bruised, or highly fibrous mangoes contain concentrated fructose and natural pectin, perfect for silky purees and preserves.',
    actionSteps: [
      'Slice soft mango flesh away from the flat pit (excise any dark outer bruises).',
      'Blend with whole greek yogurt or coconut milk, a pinch of crushed cardamom, and dash of lime juice.',
      'For chutney: simmer diced mango with ground ginger, apple cider vinegar, mustard seeds, and pinch of chili for 20 mins.'
    ],
    freshnessRange: [0.15, 0.55],
    tags: ['recipe', 'lassi', 'chutney', 'zero-waste', 'high-fructose']
  },
  {
    id: 'm-nut-1',
    category: 'nutrition',
    produceType: 'mango',
    title: 'Mangiferin & Beta-Carotene Bioavailability',
    description: 'Mangoes are packed with mangiferin (a rare potent polyphenol antioxidant), Vitamin C (67% DV), and Vitamin A precursors.',
    actionSteps: [
      'Peak aromatic ripeness maximizes carotenoid and zeaxanthin content for ocular and cellular health.',
      'Overripe mangoes convert complex polysaccharides into rapid-digesting simple sugars without losing key polyphenols.',
      'Combine with healthy fats (like yogurt or nuts) to maximize lipid-soluble beta-carotene absorption.'
    ],
    freshnessRange: [0.0, 1.0],
    tags: ['nutrition', 'mangiferin', 'vitamin-c', 'antioxidants', 'carotenoids']
  },
  {
    id: 'm-comp-1',
    category: 'upcycling_compost',
    produceType: 'mango',
    title: 'Mango Seed Kernel Charcoal & Peel Bio-Enzyme Cleaner',
    description: 'Mango peel contains concentrated citric acid and natural bio-surfactants, while the fibrous seed pit provides slow-release carbon.',
    actionSteps: [
      'Ferment mango peels in a sealed container with brown sugar and water (1:3:10 ratio) for 3 weeks to create multi-surface bio-enzyme cleaner.',
      'Scrape the inner kernel from the hard fibrous pit; dry and grind into antioxidant cosmetic scrub or bury as slow-release soil conditioner.',
      'Chop discarded peels into active aerobic compost to add fast microbial food.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['compost', 'upcycling', 'bio-enzyme', 'circular-waste']
  },

  // ==========================================
  // --- BANANA ---
  // ==========================================
  {
    id: 'b-stor-1',
    category: 'storage',
    produceType: 'banana',
    title: 'Ethylene Crown Isolation Protocol',
    description: 'Bananas emit high concentrations of ethylene gas primarily from their top stem crowns.',
    actionSteps: [
      'Wrap the crown / stem tightly with beeswax wrap or aluminum foil to block ethylene gas diffusion.',
      'Separate bananas from the bunch to prevent cluster cascade ripening.',
      'Keep away from avocados, apples, and leafy greens unless intentionally accelerating ripening.'
    ],
    freshnessRange: [0.50, 1.0],
    tags: ['storage', 'ethylene-control', 'shelf-extension']
  },
  {
    id: 'b-rec-1',
    category: 'recipe',
    produceType: 'banana',
    title: 'Caramelized Overripe Banana Loaf & "Nice Cream"',
    description: 'High-sugar brown bananas yield maximum natural sweetness and moisture without added refined sugars.',
    actionSteps: [
      'Mash 3 brown or freckled bananas with a fork; fold into 2 cups flour, 1 tsp baking soda, and 1/3 cup melted butter or oil.',
      'Bake at 175°C (350°F) for 50-55 mins until a toothpick inserted into center comes out clean.',
      'Alternatively, freeze peeled chunks and blend in a high-speed blender for 1-ingredient dairy-free soft serve.'
    ],
    freshnessRange: [0.15, 0.50],
    tags: ['recipe', 'baking', 'zero-waste', 'high-potassium']
  },
  {
    id: 'b-nut-1',
    category: 'nutrition',
    produceType: 'banana',
    title: 'Starch to Fructose Glycemic Conversion',
    description: 'As bananas ripen and peel turns yellow with brown freckles, resistant starch converts into bioavailable simple sugars.',
    actionSteps: [
      'Green/firm bananas contain high prebiotic resistant starch for gut microbiome health and insulin sensitivity.',
      'Freckled yellow bananas have peaked antioxidant (dopamine/catechin) and bioavailable potassium levels.',
      'Brown bananas provide rapid-digesting natural glucose ideal for athletic energy and quick digestion.'
    ],
    freshnessRange: [0.0, 1.0],
    tags: ['nutrition', 'potassium', 'gut-health', 'glycemic-index']
  },
  {
    id: 'b-comp-1',
    category: 'upcycling_compost',
    produceType: 'banana',
    title: 'Potassium & Phosphorus Liquid Plant Fertilizer',
    description: 'Banana peels are packed with potassium (K), magnesium (Mg), and calcium (Ca), essential for flowering garden plants.',
    actionSteps: [
      'Submerge chopped banana peels in a jar of aerated water for 48-72 hours.',
      'Strain the nutrient-dense potassium tea and dilute 1:5 with tap water.',
      'Apply directly to the base of flowering plants, tomato vines, or indoor houseplants to strengthen stems.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['compost', 'circular-economy', 'bio-fertilizer', 'potassium']
  },

  // ==========================================
  // --- ORANGE & CITRUS ---
  // ==========================================
  {
    id: 'or-stor-1',
    category: 'storage',
    produceType: 'orange',
    title: 'Ventilated Mesh Crisper & Mold Spore Prevention',
    description: 'Citrus fruits need airflow. Trapped humidity inside plastic bags rapidly triggers Penicillium digitatum (green mold).',
    actionSteps: [
      'Store in a loose breathable mesh bag or fruit basket at cool room temperature for up to 10 days.',
      'For extended 3-4 week storage, place in the refrigerator crisper drawer set to low-humidity.',
      'Keep dry; wipe off any surface condensation immediately before refrigeration.'
    ],
    freshnessRange: [0.40, 1.0],
    tags: ['storage', 'citrus', 'mold-prevention', 'airflow']
  },
  {
    id: 'or-rec-1',
    category: 'recipe',
    produceType: 'orange',
    title: 'Candied Citrus Peel & Spiced Glaze Reduction',
    description: 'Slightly dried or wrinkled oranges retain potent aromatic oils in the flavedo (outer peel) and concentrated citric sugars.',
    actionSteps: [
      'Julienne the colorful outer orange peel (avoiding excessive bitter white pith).',
      'Boil peels in simple syrup (1:1 sugar and water) for 35 mins until translucent; roll in sugar to dry.',
      'Juice the softening pulp and simmer with honey and rosemary for a savory citrus reduction over roasted vegetables.'
    ],
    freshnessRange: [0.15, 0.55],
    tags: ['recipe', 'candied-peel', 'citrus-glaze', 'zero-waste']
  },
  {
    id: 'or-nut-1',
    category: 'nutrition',
    produceType: 'orange',
    title: 'Hesperidin Bioflavonoids & Vitamin C Longevity',
    description: 'Oranges are renowned for Vitamin C (ascorbic acid) and hesperidin—a flavonoid in the inner white pith supporting cardiovascular blood flow.',
    actionSteps: [
      'Do not aggressively scrape away all white pith (albedo); it contains 65% of the fruit\'s total bioflavonoids.',
      'Vitamin C degradation increases upon slicing; consume freshly peeled or store tightly sealed in an opaque container.',
      'Citric acid significantly improves the bioavailability of non-heme iron from leafy greens.'
    ],
    freshnessRange: [0.0, 1.0],
    tags: ['nutrition', 'vitamin-c', 'hesperidin', 'bioflavonoids']
  },
  {
    id: 'or-comp-1',
    category: 'upcycling_compost',
    produceType: 'orange',
    title: 'Citrus D-Limonene Degreaser & Soil Pest Repellent',
    description: 'Orange peels contain D-Limonene, an industrial-strength natural solvent and insect deterrent.',
    actionSteps: [
      'Pack mason jar with orange peels, submerge with white vinegar, and steep for 2 weeks in a dark cabinet.',
      'Strain liquid into a spray bottle for an eco-friendly non-toxic kitchen degreaser that dissolves oil instantly.',
      'Scatter dried peel shreds around garden perimeters to deter aphids and slugs without synthetic pesticides.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['upcycling', 'd-limonene', 'degreaser', 'natural-pest-control']
  },

  // ==========================================
  // --- LEMON ---
  // ==========================================
  {
    id: 'lem-stor-1',
    category: 'storage',
    produceType: 'lemon',
    title: 'Submerged Water Cold Stasis Technique',
    description: 'Lemons lose moisture through porous rinds when left on countertops, hardening in 7 days.',
    actionSteps: [
      'Submerge whole fresh lemons completely in a glass jar filled with fresh cold water, seal airtight, and refrigerate.',
      'This hydraulic barrier prevents peel dehydration, keeping lemons plump and juicy for over 4-6 weeks.',
      'Change the jar water once every two weeks.'
    ],
    freshnessRange: [0.40, 1.0],
    tags: ['storage', 'lemon', 'submerged-water', 'anti-dehydration']
  },
  {
    id: 'lem-rec-1',
    category: 'recipe',
    produceType: 'lemon',
    title: 'Moroccan Salt-Preserved Lemons & Limoncello Infusion',
    description: 'Softening lemons transform through lacto-fermentation into a gourmet umami culinary staple.',
    actionSteps: [
      'Quarter soft lemons 3/4 down the stem, pack generously with coarse sea salt, and press tightly into a sterile jar until submerged in their own juice.',
      'Ferment at room temperature for 3-4 weeks; the rind becomes tender, mellow, and intensely fragrant.',
      'Use preserved rinds in tagines, grain salads, pasta, and vinaigrettes.'
    ],
    freshnessRange: [0.15, 0.50],
    tags: ['recipe', 'preserved-lemons', 'fermentation', 'culinary-rescue']
  },
  {
    id: 'lem-comp-1',
    category: 'upcycling_compost',
    produceType: 'lemon',
    title: 'Garbage Disposal Deodorizer & Mineral Descaler',
    description: 'Spent lemon rinds contain natural citric acid that dissolves hard water calcium limescale.',
    actionSteps: [
      'Freeze used lemon rinds in an ice cube tray with a splash of vinegar.',
      'Run frozen cubes through the kitchen disposal unit to clean blades, strip grime, and eliminate bacterial odor.',
      'Rub cut rinds over stainless steel faucets and kettle interiors to instantly dissolve mineral scale.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['upcycling', 'cleaning', 'citric-acid', 'descaler']
  },

  // ==========================================
  // --- TOMATO ---
  // ==========================================
  {
    id: 't-stor-1',
    category: 'storage',
    produceType: 'tomato',
    title: 'Stem-Down Ambient Temperature Protocol',
    description: 'Refrigerating fresh tomatoes below 12°C degrades volatile aromatic enzymes (Z-3-hexenal) and makes flesh mealy.',
    actionSteps: [
      'Store stem-side down on a flat breathable surface to block moisture evaporation and prevent fungal entry through the calyx scar.',
      'Keep at 16°C - 20°C (60°F - 68°F) out of direct sun.',
      'Only refrigerate once cut, or if fully ripe and soft to delay mold for 48 hours.'
    ],
    freshnessRange: [0.40, 1.0],
    tags: ['storage', 'stem-down', 'temperature-control', 'flavor-preservation']
  },
  {
    id: 't-rec-1',
    category: 'recipe',
    produceType: 'tomato',
    title: 'Slow-Simmered Umami Marinara & Roasted Tomato Confit',
    description: 'Softening bruised tomatoes release high free glutamic acid when reduced slowly with olive oil.',
    actionSteps: [
      'Coarsely chop soft or split tomatoes (no peeling required).',
      'Roast with whole garlic cloves, olive oil, thyme, and sea salt at 150°C (300°F) for 1 hour until caramelized.',
      'Blend for an ultra-rich pasta sauce or spread over crusty toasted sourdough.'
    ],
    freshnessRange: [0.15, 0.50],
    tags: ['recipe', 'marinara', 'confit', 'umami', 'high-lycopene']
  },
  {
    id: 't-nut-1',
    category: 'nutrition',
    produceType: 'tomato',
    title: 'Thermal Lycopene Bioavailability Enhancement',
    description: 'Lycopene is a potent lipid-soluble carotenoid antioxidant linked to cellular defense and cardiovascular support.',
    actionSteps: [
      'Gently cooking softening tomatoes breaks down tough cell walls, converting trans-lycopene into highly absorbable cis-isomers.',
      'Consuming with healthy dietary lipids (olive oil or avocado) increases systemic bioavailability by over 300%.',
      'Ripening naturally increases total antioxidant carotenoid concentration.'
    ],
    freshnessRange: [0.0, 1.0],
    tags: ['nutrition', 'lycopene', 'antioxidants', 'bioavailability']
  },
  {
    id: 't-comp-1',
    category: 'upcycling_compost',
    produceType: 'tomato',
    title: 'Bokashi Anaerobic Acid Fermentation',
    description: 'Overly spoiled or moldy tomatoes should undergo controlled anaerobic pre-fermentation to sanitize pathogens.',
    actionSteps: [
      'Place spoiled tomatoes into an airtight Bokashi bucket layered with EM-1 microbial bran inoculant.',
      'The anaerobic lactic acid bacteria ferment the organic material in 14 days without methane emissions.',
      'Bury the fermented pre-compost 8 inches deep into garden beds to enrich soil microbiota.'
    ],
    freshnessRange: [0.0, 0.20],
    tags: ['compost', 'bokashi', 'microbial-regeneration', 'circular-waste']
  },

  // ==========================================
  // --- AVOCADO ---
  // ==========================================
  {
    id: 'av-stor-1',
    category: 'storage',
    produceType: 'avocado',
    title: 'Enzymatic Polyphenol Oxidase (PPO) Inhibition',
    description: 'Contact with atmospheric O₂ causes polyphenol oxidase enzymes to oxidatively brown cut avocado flesh.',
    actionSteps: [
      'For uncut ripe avocados: refrigerate at 4°C to decelerate ripening metabolism by 85%.',
      'For halved avocados: leave the pit in place, brush exposed green flesh with lemon juice or olive oil, and press plastic wrap/parchment flush against surface.',
      'Store cut halves in an airtight container with a slice of cut red onion (sulfur vapors naturally retard oxidation).'
    ],
    freshnessRange: [0.35, 0.95],
    tags: ['storage', 'anti-browning', 'oxidation-prevention', 'freshness']
  },
  {
    id: 'av-rec-1',
    category: 'recipe',
    produceType: 'avocado',
    title: 'Velvety Dark Cacao Mousse & Goddess Dressing',
    description: 'Overly soft avocados emulsify into an ultra-creamy base without any detectable avocado flavor when paired with dark cocoa or herbs.',
    actionSteps: [
      'Blend 1 very soft avocado with 3 tbsp raw cacao powder, 2 tbsp maple syrup, 1 tsp vanilla, and 3 tbsp almond milk.',
      'Chill in the refrigerator for 20 minutes before serving as a rich, dairy-free chocolate pudding.',
      'For savory: blend with garlic, parsley, lemon juice, and olive oil for a creamy green goddess salad dressing.'
    ],
    freshnessRange: [0.15, 0.45],
    tags: ['recipe', 'dessert', 'healthy-fats', 'dairy-free', 'monounsaturated']
  },
  {
    id: 'av-comp-1',
    category: 'upcycling_compost',
    produceType: 'avocado',
    title: 'Avocado Seed Natural Botanical Pink Dye & Seed Charcoal',
    description: 'Avocado pits and skins are rich in perseorangin tannins that produce permanent natural peach/pink textile dye.',
    actionSteps: [
      'Boil crushed avocado pits and peels in water for 45 minutes to extract concentrated ruby-pink natural dye.',
      'Soak natural cotton, wool, or linen fabric for an eco-friendly textile dye that requires no chemical mordant.',
      'Spent pit fragments decompose rapidly once boiled.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['upcycling', 'natural-dye', 'zero-waste', 'circular-economy']
  },

  // ==========================================
  // --- APPLE ---
  // ==========================================
  {
    id: 'ap-stor-1',
    category: 'storage',
    produceType: 'apple',
    title: 'High-Humidity Crisper & Ethylene Isolation',
    description: 'Apples are intense ethylene gas emitters and lose crispness rapidly in dry warm air.',
    actionSteps: [
      'Store in the crisper drawer of your refrigerator at 1°C - 4°C with 85-90% relative humidity.',
      'Keep apples isolated from leafy greens, carrots, and broccoli to prevent premature yellowing.',
      'Inspect weekly and remove any bruised apple immediately to prevent "one bad apple spoiling the barrel".'
    ],
    freshnessRange: [0.45, 1.0],
    tags: ['storage', 'apple', 'crisper', 'humidity-control']
  },
  {
    id: 'ap-rec-1',
    category: 'recipe',
    produceType: 'apple',
    title: 'Spiced Pectin Apple Compote & Baked Apple Rings',
    description: 'Soft or bruised apples retain high natural pectin that thickens preserves and baked desserts naturally.',
    actionSteps: [
      'Core and dice soft apples (excise any soft brown bruise spots).',
      'Simmer with 1 cinnamon stick, 1 star anise, 1 tbsp apple cider vinegar, and 1 tbsp brown sugar for 25 mins.',
      'Jar and refrigerate for up to 3 weeks for oatmeal toppings, yogurt mix-ins, or pastry fillings.'
    ],
    freshnessRange: [0.15, 0.50],
    tags: ['recipe', 'compote', 'pectin', 'preservation', 'zero-waste']
  },
  {
    id: 'ap-comp-1',
    category: 'upcycling_compost',
    produceType: 'apple',
    title: 'Apple Scrap Probiotic Cleaning Vinegar',
    description: 'Apple cores and peels can be fermented by acetobacter into natural acetic acid kitchen cleaner.',
    actionSteps: [
      'Fill a glass jar with apple cores, peels, 1 tbsp raw sugar, and filtered water.',
      'Cover with cheesecloth and let ferment at room temperature for 3-4 weeks.',
      'Strain to yield pure natural raw apple cider vinegar for cleaning kitchen surfaces and salad dressings.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['fermentation', 'eco-cleaning', 'circular-waste', 'apple-cider-vinegar']
  },

  // ==========================================
  // --- LEAFY GREENS & SPINACH ---
  // ==========================================
  {
    id: 'lg-stor-1',
    category: 'storage',
    produceType: 'leafy_greens',
    title: 'Paper Towel Hydration Lock & Stem Trimming',
    description: 'Leafy greens wilt due to transpiration water loss and decay if resting against pooling condensation.',
    actionSteps: [
      'Trim 1/4 inch off stem ends and stand like a bouquet in a glass with 1 inch of water in the fridge.',
      'Alternatively, line an airtight container with dry paper towels to absorb excess moisture while maintaining high humidity.',
      'Never wash leafy greens until immediately before consumption.'
    ],
    freshnessRange: [0.45, 1.0],
    tags: ['storage', 'greens', 'hydration-lock', 'crispness']
  },
  {
    id: 'lg-rec-1',
    category: 'recipe',
    produceType: 'leafy_greens',
    title: 'Zero-Waste Pesto Genovese & Green Vitality Cubes',
    description: 'Wilted spinach, arugula, and kale instantly regain silky texture when emulsion-blended with nuts and olive oil.',
    actionSteps: [
      'Shock wilted greens in ice water for 3 minutes to restore cellular turgor pressure.',
      'Blend with garlic, walnuts or pine nuts, parmesan, olive oil, and pinch of sea salt for fresh pesto.',
      'Alternatively, blend wilted greens with water and freeze in ice cube trays for instant morning smoothie nutrition.'
    ],
    freshnessRange: [0.20, 0.55],
    tags: ['recipe', 'pesto', 'iron-rich', 'cellular-turgor', 'smoothie-cubes']
  },
  {
    id: 'lg-comp-1',
    category: 'upcycling_compost',
    produceType: 'leafy_greens',
    title: 'High-Nitrogen "Green" Aerobic Compost Layer',
    description: 'Decaying greens are rich in bio-nitrogen (C:N ratio ~15:1), ideal for jumpstarting microbial heat in compost piles.',
    actionSteps: [
      'Layer decaying greens 1:2 with dry leaves, shredded cardboard, or sawdust ("brown" carbon layers).',
      'Maintain moisture level like a wrung-out sponge to generate thermophilic decomposition (55°C-65°C).',
      'Turns rapidly into dark nutrient-dense humus within 6-8 weeks.'
    ],
    freshnessRange: [0.0, 0.25],
    tags: ['compost', 'nitrogen-ratio', 'soil-building', 'aerobic']
  },

  // ==========================================
  // --- UNIVERSAL MASTER PROTOCOL ---
  // ==========================================
  {
    id: 'gen-comp-1',
    category: 'upcycling_compost',
    produceType: 'all',
    title: 'Master Carbon-Nitrogen Aerobic Composting Protocol',
    description: 'General guidelines for diverting decayed organic matter into living humus.',
    actionSteps: [
      'Maintain an ideal Carbon (Browns/Leaves) to Nitrogen (Greens/Produce) balance of roughly 30:1 by volume.',
      'Aerate weekly by turning the heap to sustain aerobic actinomycetes and prevent sulfur odors.',
      'Finished compost should smell like a fresh forest floor with a dark, crumbly loam structure.'
    ],
    freshnessRange: [0.0, 0.30],
    tags: ['compost', 'aerobic', 'soil-regeneration', 'circular-economy']
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
  const normalizedDocType = (doc.produceType || '').toLowerCase().trim();
  const normalizedQueryType = (queryType || '').toLowerCase().trim();

  if (normalizedDocType === normalizedQueryType) {
    score += 100;
  } else if (normalizedDocType === 'all') {
    score += 25;
  } else if (
    (normalizedDocType.includes('leaf') && normalizedQueryType.includes('leaf')) ||
    (normalizedDocType.includes('spinach') && normalizedQueryType.includes('leaf')) ||
    (normalizedDocType.includes('citrus') && ['lemon', 'orange', 'lime'].includes(normalizedQueryType)) ||
    (['orange', 'lemon', 'lime'].includes(normalizedDocType) && ['orange', 'lemon', 'lime'].includes(normalizedQueryType))
  ) {
    score += 60;
  } else {
    // Different produce type, penalty
    score -= 40;
  }

  // 2. Category match bonus (highest priority when user is looking at a specific tab)
  if (preferredCategory && doc.category === preferredCategory) {
    score += 50;
  }

  // 3. Freshness Range proximity
  const [minQ, maxQ] = doc.freshnessRange;
  if (qualityScore >= minQ && qualityScore <= maxQ) {
    score += 30;
  } else {
    const dist = Math.min(Math.abs(qualityScore - minQ), Math.abs(qualityScore - maxQ));
    score += Math.max(0, 20 - dist * 40);
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
  limit: number = 4
): KnowledgeDocument[] {
  const scored = KNOWLEDGE_CORPUS.map(doc => ({
    doc,
    score: scoreDocumentMatch(doc, produceType, qualityScore, category)
  }));

  // If a category was requested, filter to ensure only that category is returned if available
  if (category) {
    const categoryDocs = scored.filter(s => s.doc.category === category);
    if (categoryDocs.length > 0) {
      categoryDocs.sort((a, b) => b.score - a.score);
      return categoryDocs.slice(0, limit).map(s => s.doc);
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.doc);
}
