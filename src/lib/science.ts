/**
 * Arrhenius Engine and Science Logic for BioFresh-CV
 */

export interface ProduceMetadata {
  A: number;
  Ea: number;
  avgWeightG: number;
  nutrientsPer100g: Record<string, { value: number; unit: string }>;
}

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
};

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

export function calculateDecayRate(type: string, temperatureK: number): number {
  const metadata = PRODUCE_DATA[type.toLowerCase()] || DEFAULT_DATA;
  const R = 8.314;
  return metadata.A * Math.exp(-metadata.Ea / (R * temperatureK));
}

export function calculateRUL(qualityScore: number, k: number): number {
  if (k <= 0) return 999;
  return qualityScore / k;
}

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

export function getNutrientRetention(type: string, qualityScore: number): { weightG: number; nutrients: NutrientDetail[] } {
  const metadata = PRODUCE_DATA[type.toLowerCase()] || DEFAULT_DATA;
  
  const results: NutrientDetail[] = [];
  
  // Coefficients that define how sensitively nutrients drop compared to visual quality
  // 1.0 means they drop at the same rate. 
  // < 1.0 means they drop SLOWER than visual decay (e.g. minerals)
  // > 1.0 means they drop FASTER than visual decay (e.g. volatile vit C)
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
    
    // We use a power function to model nutrient retention relative to quality score
    // Factor = qualityScore ^ sensitivity
    const factor = Math.pow(qualityScore, sensitivity);
    
    // Per item calculation (based on average weight)
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

export function getFreshnessLabel(rulHours: number): { label: string; color: string } {
  if (rulHours > 48) return { label: 'Fresh', color: 'text-green-500' };
  if (rulHours >= 24) return { label: 'Near-Expiry', color: 'text-amber-500' };
  return { label: 'Overripe', color: 'text-red-500' };
}
