/**
 * Arrhenius Engine and Science Logic for BioFresh-CV
 * 
 * In simple words:
 * Fruits and veggies rot faster when it's warm and slower in the fridge!
 * We use the famous "Arrhenius Equation" from chemistry to calculate the exact decay speed (k)
 * based on the storage temperature, and then calculate how many hours the produce has left.
 */

// Structure storing the chemistry constants and baseline vitamins for each fruit/veggie
export interface ProduceMetadata {
  A: number; // Pre-exponential factor (frequency of chemical reactions per hour)
  Ea: number; // Activation energy in J/mol (energy barrier needed for decay reactions)
  avgWeightG: number; // Typical weight of one whole fruit/vegetable in grams
  nutrientsPer100g: Record<string, { value: number; unit: string }>; // Vitamin/mineral content in 100g
}

// Database of specific fruits & vegetables with their scientific constants & healthy nutrients
export const PRODUCE_DATA: Record<string, ProduceMetadata> = {
  banana: { 
    A: 2.0e8, 
    Ea: 60000, 
    avgWeightG: 120,
    nutrientsPer100g: {
      'Potassium': { value: 358, unit: 'mg' },
      'Vitamin B6': { value: 0.4, unit: 'mg' },
      'Dietary Fiber': { value: 2.6, unit: 'g' },
      'Vitamin C': { value: 8.7, unit: 'mg' },
      'Magnesium': { value: 27, unit: 'mg' },
    }
  },
  tomato: { 
    A: 1.3e8, 
    Ea: 60000, 
    avgWeightG: 150,
    nutrientsPer100g: {
      'Lycopene': { value: 2.5, unit: 'mg' },
      'Vitamin C': { value: 13.7, unit: 'mg' },
      'Potassium': { value: 237, unit: 'mg' },
      'Vitamin K': { value: 7.9, unit: 'μg' },
      'Folate': { value: 15, unit: 'μg' },
    }
  },
  apple: { 
    A: 0.6e8, 
    Ea: 60000, 
    avgWeightG: 180,
    nutrientsPer100g: {
      'Dietary Fiber': { value: 2.4, unit: 'g' },
      'Vitamin C': { value: 4.6, unit: 'mg' },
      'Potassium': { value: 107, unit: 'mg' },
      'Quercetin': { value: 4.4, unit: 'mg' },
      'Vitamin K': { value: 2.2, unit: 'μg' },
    }
  },
  orange: { 
    A: 1.0e8, 
    Ea: 60000, 
    avgWeightG: 130,
    nutrientsPer100g: {
      'Vitamin C': { value: 53.2, unit: 'mg' },
      'Folate': { value: 30, unit: 'μg' },
      'Thiamine': { value: 0.08, unit: 'mg' },
      'Potassium': { value: 181, unit: 'mg' },
      'Dietary Fiber': { value: 2.4, unit: 'g' },
    }
  },
  lemon: { 
    A: 1.0e8, 
    Ea: 60000, 
    avgWeightG: 85,
    nutrientsPer100g: {
      'Vitamin C': { value: 53.0, unit: 'mg' },
      'Citric Acid': { value: 4.5, unit: 'g' },
      'Flavonoids': { value: 21, unit: 'mg' },
      'Potassium': { value: 138, unit: 'mg' },
      'Vitamin B6': { value: 0.08, unit: 'mg' },
    }
  },
  avocado: { 
    A: 1.2e8, 
    Ea: 60000, 
    avgWeightG: 170,
    nutrientsPer100g: {
      'Monounsaturated Fats': { value: 9.8, unit: 'g' },
      'Potassium': { value: 485, unit: 'mg' },
      'Dietary Fiber': { value: 6.7, unit: 'g' },
      'Vitamin E': { value: 2.07, unit: 'mg' },
      'Vitamin K': { value: 21, unit: 'μg' },
      'Folate': { value: 81, unit: 'μg' },
    }
  },
  mango: { 
    A: 1.5e8, 
    Ea: 60000, 
    avgWeightG: 200,
    nutrientsPer100g: {
      'Vitamin C': { value: 36.4, unit: 'mg' },
      'Vitamin A': { value: 54, unit: 'μg' },
      'Dietary Fiber': { value: 1.6, unit: 'g' },
      'Potassium': { value: 168, unit: 'mg' },
      'Folate': { value: 43, unit: 'μg' },
    }
  },
  leafy_greens: { 
    A: 4.6e8, 
    Ea: 60000, 
    avgWeightG: 200,
    nutrientsPer100g: {
      'Vitamin K': { value: 483, unit: 'μg' },
      'Vitamin A': { value: 469, unit: 'μg' },
      'Vitamin C': { value: 28.1, unit: 'mg' },
      'Folate': { value: 194, unit: 'μg' },
      'Iron': { value: 2.7, unit: 'mg' },
      'Calcium': { value: 99, unit: 'mg' },
    }
  },
  papaya: {
    A: 1.4e8,
    Ea: 60000,
    avgWeightG: 300,
    nutrientsPer100g: {
      'Vitamin C': { value: 60.9, unit: 'mg' },
      'Vitamin A': { value: 47, unit: 'μg' },
      'Folate': { value: 37, unit: 'μg' },
      'Papain Enzyme': { value: 1.2, unit: 'mg' },
      'Dietary Fiber': { value: 1.7, unit: 'g' },
    }
  },
  lime: {
    A: 1.1e8,
    Ea: 60000,
    avgWeightG: 67,
    nutrientsPer100g: {
      'Vitamin C': { value: 29.1, unit: 'mg' },
      'Citric Acid': { value: 4.0, unit: 'g' },
      'Potassium': { value: 102, unit: 'mg' },
      'Flavonoids': { value: 18, unit: 'mg' },
    }
  },
  cucumber: {
    A: 2.5e8,
    Ea: 60000,
    avgWeightG: 200,
    nutrientsPer100g: {
      'Water Content': { value: 95.2, unit: 'g' },
      'Vitamin K': { value: 16.4, unit: 'μg' },
      'Potassium': { value: 147, unit: 'mg' },
      'Cucurbitacins': { value: 0.8, unit: 'mg' },
    }
  }
};

// Fallback values used if a generic or unlisted produce item is scanned
const DEFAULT_DATA: ProduceMetadata = { 
  A: 1.3e8, 
  Ea: 60000, 
  avgWeightG: 150,
  nutrientsPer100g: {
    'Vitamin C': { value: 15, unit: 'mg' },
    'Dietary Fiber': { value: 2.0, unit: 'g' },
    'Potassium': { value: 150, unit: 'mg' },
    'Antioxidants': { value: 1.0, unit: 'mmol' },
  }
};

/**
 * calculateDecayRate
 * 
 * Calculates reaction rate constant (k) using Arrhenius Law:
 *   k = A * e^(-Ea / (R * T))
 * 
 * Simple explanation:
 * - Higher temperature (T in Kelvin) makes k bigger (spoilage happens faster).
 * - Lower temperature (like in a fridge at 4°C) makes k smaller (spoilage slows down).
 */
export function calculateDecayRate(type: string, temperatureK: number): number {
  const metadata = PRODUCE_DATA[type.toLowerCase()] || DEFAULT_DATA;
  const R = 8.314; // Universal gas constant in J/(mol·K)
  return metadata.A * Math.exp(-metadata.Ea / (R * temperatureK));
}

/**
 * calculateRUL (Remaining Useful Life)
 * 
 * Takes the visual quality score (0.0 to 1.0) and divides by decay rate (k)
 * to return remaining hours of shelf life.
 * 
 * Example: Quality 0.8 / decay speed 0.01 = 80 hours left!
 */
export function calculateRUL(qualityScore: number, k: number): number {
  if (k <= 0) return 999;
  return qualityScore / k;
}

// Format for showing a specific nutrient in the UI
export interface NutrientDetail {
  name: string;
  currentValue: number;
  baseValue: number;
  percentage: number;
  unit: string;
}

const NUTRIENT_DECAY_RATES: Record<string, number> = {
  'Vitamin C': 0.005,
  'Vitamin A': 0.003,
  'Folate': 0.004,
  'Potassium': 0.0005,
  'Antioxidants': 0.002,
};

/**
 * getNutrientRetention
 * 
 * Estimates how many vitamins and minerals are still present in the fruit/vegetable.
 * - Fragile vitamins (like Vitamin C and Folate) drop quickly when produce ripens or ages.
 * - Stable minerals (like Potassium and Iron) stay intact much longer.
 */
export function getNutrientRetention(type: string, qualityScore: number): { weightG: number; nutrients: NutrientDetail[] } {
  const metadata = PRODUCE_DATA[type.toLowerCase()] || DEFAULT_DATA;
  
  const results: NutrientDetail[] = [];
  
  // Coefficients that define how sensitively nutrients drop compared to visual quality:
  // - 1.0 means they drop at the exact same rate as visual freshness.
  // - < 1.0 means they drop SLOWER than visual decay (e.g. minerals like Potassium).
  // - > 1.0 means they drop FASTER than visual decay (e.g. volatile Vitamin C).
  const NUTRIENT_SENSITIVITY: Record<string, number> = {
    'Vitamin C': 1.3,
    'Folate': 1.2,
    'Thiamine': 1.1,
    'Vitamin B6': 1.1,
    'Vitamin A': 0.8,
    'Vitamin K': 0.7,
    'Potassium': 0.3,
    'Magnesium': 0.3,
    'Iron': 0.3,
    'Calcium': 0.3,
    'Dietary Fiber': 0.1,
    'Lycopene': 0.9,
    'Quercetin': 0.9,
    'Flavonoids': 0.9,
    'Citric Acid': 0.8,
    'Antioxidants': 0.9,
  };
  
  Object.entries(metadata.nutrientsPer100g).forEach(([name, data]) => {
    const sensitivity = NUTRIENT_SENSITIVITY[name] || 1.0;
    
    // We use a power curve: Factor = qualityScore ^ sensitivity
    const factor = Math.pow(qualityScore, sensitivity);
    
    // Calculate total mg/g per whole fruit based on its average gram weight
    const baseValue = (data.value * metadata.avgWeightG) / 100;
    const currentValue = baseValue * factor;
    
    results.push({
      name,
      currentValue,
      baseValue,
      percentage: factor * 100,
      unit: data.unit
    });
  });

  return {
    weightG: metadata.avgWeightG,
    nutrients: results
  };
}

/**
 * getFreshnessLabel
 * 
 * Returns a friendly text badge ('Fresh', 'Near-Expiry', 'Overripe')
 * and color styling based on how many hours are left.
 */
export function getFreshnessLabel(rulHours: number): { label: string; color: string } {
  if (rulHours > 48) return { label: 'Fresh', color: 'text-green-500' };
  if (rulHours >= 24) return { label: 'Near-Expiry', color: 'text-amber-500' };
  return { label: 'Overripe', color: 'text-red-500' };
}
