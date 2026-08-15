/**
 * Waste Reduction Recipe Recommendations
 * 
 * In simple words:
 * When produce has less than 24 hours left before expiring (near-expiry),
 * we suggest delicious zero-waste recipes (like banana bread or smoothies)
 * so the user eats it before it goes bad!
 */

// Structure of a recipe recommendation
export interface Recipe {
  id: string; // Unique recipe ID
  name: string; // Title of the dish (e.g. 'Overripe Banana Bread')
  description: string; // Quick note on why it's great for aging produce
  ingredients: string[]; // List of ingredients needed
}

// Database of delicious ways to rescue near-expiry produce
export const RECIPE_DB: Record<string, Recipe[]> = {
  banana: [
    {
      id: 'b1',
      name: 'Overripe Banana Bread',
      description: 'The classic way to use up brown bananas. Moist and delicious.',
      ingredients: ['3 bananas', '2 cups flour', '1 tsp baking soda', '1/2 cup butter'],
    },
    {
      id: 'b2',
      name: 'Banana Oat Smoothie',
      description: 'Quick breakfast using frozen or overripe bananas.',
      ingredients: ['1 banana', '1/2 cup oats', '1 cup milk', 'Honey'],
    },
    {
      id: 'b3',
      name: 'Banana Pancakes',
      description: '3-ingredient healthy pancakes.',
      ingredients: ['1 banana', '2 eggs', 'Cinnamon'],
    },
  ],
  tomato: [
    {
      id: 't1',
      name: 'Roasted Tomato Sauce',
      description: 'Great for tomatoes that are getting a bit soft.',
      ingredients: ['5 tomatoes', 'Garlic', 'Olive oil', 'Basil'],
    },
    {
      id: 't2',
      name: 'Tomato Bruschetta',
      description: 'Fresh appetizer using ripe tomatoes.',
      ingredients: ['3 tomatoes', 'Baguette', 'Balsamic glaze', 'Garlic'],
    },
  ],
  apple: [
    {
      id: 'a1',
      name: 'Baked Apple Cinnamon',
      description: 'Warm comfort food for slightly soft apples.',
      ingredients: ['2 apples', 'Cinnamon', 'Brown sugar', 'Oats'],
    },
    {
      id: 'a2',
      name: 'Homemade Apple Sauce',
      description: 'Puree older apples for a healthy snack.',
      ingredients: ['4 apples', 'Water', 'Cinnamon'],
    },
  ],
  leafy_greens: [
    {
      id: 'lg1',
      name: 'Green Power Smoothie',
      description: 'Blend wilted greens with fruit for a nutrient boost.',
      ingredients: ['2 cups greens', '1 apple', '1 cup water', 'Lemon'],
    },
    {
      id: 'lg2',
      name: 'Savory Green Frittata',
      description: 'Sauté older greens into eggs.',
      ingredients: ['2 cups greens', '4 eggs', 'Onion', 'Cheese'],
    },
  ],
  default: [
    {
      id: 'd1',
      name: 'Zero-Waste Vegetable Stock',
      description: 'Simmer vegetable scraps and older produce for a rich base.',
      ingredients: ['Produce scraps', 'Water', 'Salt', 'Herbs'],
    },
    {
      id: 'd2',
      name: 'Daily Fruit Compote',
      description: 'Cook down fruit with a little sugar for yogurt topping.',
      ingredients: ['Diced fruit', 'Sugar', 'Lemon juice'],
    },
  ],
};

/**
 * getRecommendations
 * 
 * If produce has less than 24 hours left (rulHours < 24),
 * this returns recipes matching that fruit/vegetable.
 * If it's still fresh (> 24h), no urgent recipes are needed so it returns empty.
 */
export function getRecommendations(produceType: string, rulHours: number): Recipe[] {
  if (rulHours >= 24) return [];
  const type = produceType.toLowerCase();
  return RECIPE_DB[type] || RECIPE_DB['default'];
}
