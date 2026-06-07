// Starter catalog seed (spec 6.0 + Appendix A). ~100 common grocery items, each with a
// default section, purchase unit, and aldi_friendly. Appendix A's subset is implemented
// verbatim and expanded with obvious common groceries following the same pattern.
// recipe_to_purchase hints are added where obvious (Appendix A footnote); unknown conversions
// are left empty and handled by the merge engine (8.1a).

export type CatalogItem = {
  name: string;
  section: string; // must match a DEFAULT_SECTION_ORDER name
  purchaseUnit: string;
  aldiFriendly: boolean;
  recipeToPurchase?: Record<string, number>;
  food?: boolean; // default true; non-food (household) items set false
  taxable?: boolean; // default false (food exempt, 8.3); non-food items set true
};

export const STARTER_CATALOG: CatalogItem[] = [
  // Produce
  { name: "Bananas", section: "Produce", purchaseUnit: "bunch", aldiFriendly: true },
  { name: "Apples", section: "Produce", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Onions", section: "Produce", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Garlic", section: "Produce", purchaseUnit: "each", aldiFriendly: true },
  { name: "Carrots", section: "Produce", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Bell Peppers", section: "Produce", purchaseUnit: "each", aldiFriendly: true },
  { name: "Lettuce", section: "Produce", purchaseUnit: "each", aldiFriendly: true },
  { name: "Tomatoes", section: "Produce", purchaseUnit: "each", aldiFriendly: true },
  { name: "Potatoes", section: "Produce", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Avocados", section: "Produce", purchaseUnit: "each", aldiFriendly: true },
  { name: "Spinach", section: "Produce", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Broccoli", section: "Produce", purchaseUnit: "each", aldiFriendly: true },
  { name: "Cucumber", section: "Produce", purchaseUnit: "each", aldiFriendly: true },
  { name: "Celery", section: "Produce", purchaseUnit: "bunch", aldiFriendly: true },
  { name: "Mushrooms", section: "Produce", purchaseUnit: "oz_package", aldiFriendly: true },
  { name: "Lemons", section: "Produce", purchaseUnit: "each", aldiFriendly: true },
  { name: "Limes", section: "Produce", purchaseUnit: "each", aldiFriendly: true },
  { name: "Strawberries", section: "Produce", purchaseUnit: "each", aldiFriendly: true },

  // Bakery / Bread
  { name: "Sandwich Bread", section: "Bakery / Bread", purchaseUnit: "loaf", aldiFriendly: true },
  { name: "Tortillas (flour)", section: "Bakery / Bread", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Bagels", section: "Bakery / Bread", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Hamburger Buns", section: "Bakery / Bread", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Dinner Rolls", section: "Bakery / Bread", purchaseUnit: "bag", aldiFriendly: true },

  // Deli / Refrigerated
  { name: "Sliced Turkey", section: "Deli / Refrigerated", purchaseUnit: "oz_package", aldiFriendly: true },
  { name: "Hummus", section: "Deli / Refrigerated", purchaseUnit: "each", aldiFriendly: true },
  { name: "Sliced Ham", section: "Deli / Refrigerated", purchaseUnit: "oz_package", aldiFriendly: true },
  { name: "String Cheese", section: "Deli / Refrigerated", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Guacamole", section: "Deli / Refrigerated", purchaseUnit: "each", aldiFriendly: true },

  // Meat
  { name: "Ground Beef", section: "Meat", purchaseUnit: "lb", aldiFriendly: true },
  { name: "Chicken Breast", section: "Meat", purchaseUnit: "lb", aldiFriendly: true },
  { name: "Bacon", section: "Meat", purchaseUnit: "oz_package", aldiFriendly: true },
  { name: "Ground Turkey", section: "Meat", purchaseUnit: "lb", aldiFriendly: true },
  { name: "Pork Chops", section: "Meat", purchaseUnit: "lb", aldiFriendly: true },
  { name: "Chicken Thighs", section: "Meat", purchaseUnit: "lb", aldiFriendly: true },
  { name: "Italian Sausage", section: "Meat", purchaseUnit: "lb", aldiFriendly: true },

  // Dairy
  {
    name: "Milk (2%)",
    section: "Dairy",
    purchaseUnit: "gallon",
    aldiFriendly: true,
    recipeToPurchase: { cup: 0.0625 }, // 1 gallon = 16 cups
  },
  { name: "Eggs", section: "Dairy", purchaseUnit: "dozen", aldiFriendly: true },
  { name: "Butter", section: "Dairy", purchaseUnit: "box", aldiFriendly: true },
  {
    name: "Shredded Cheese",
    section: "Dairy",
    purchaseUnit: "bag",
    aldiFriendly: true,
    recipeToPurchase: { cup: 0.5 }, // 8 oz bag ~= 2 cups
  },
  { name: "Greek Yogurt", section: "Dairy", purchaseUnit: "each", aldiFriendly: true },
  { name: "Sour Cream", section: "Dairy", purchaseUnit: "each", aldiFriendly: true },
  { name: "Cream Cheese", section: "Dairy", purchaseUnit: "each", aldiFriendly: true },
  { name: "Sliced Cheese", section: "Dairy", purchaseUnit: "oz_package", aldiFriendly: true },
  { name: "Heavy Cream", section: "Dairy", purchaseUnit: "each", aldiFriendly: true },
  { name: "Half and Half", section: "Dairy", purchaseUnit: "each", aldiFriendly: true },

  // Frozen
  { name: "Frozen Vegetables", section: "Frozen", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Frozen Berries", section: "Frozen", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Frozen Pizza", section: "Frozen", purchaseUnit: "each", aldiFriendly: true },
  { name: "Ice Cream", section: "Frozen", purchaseUnit: "each", aldiFriendly: true },
  { name: "Frozen Waffles", section: "Frozen", purchaseUnit: "box", aldiFriendly: true },
  { name: "Frozen Chicken Nuggets", section: "Frozen", purchaseUnit: "bag", aldiFriendly: true },

  // Pantry
  { name: "Rice", section: "Pantry", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Pasta", section: "Pantry", purchaseUnit: "box", aldiFriendly: true },
  { name: "Pasta Sauce", section: "Pantry", purchaseUnit: "jar", aldiFriendly: true },
  { name: "Salsa", section: "Pantry", purchaseUnit: "jar", aldiFriendly: true },
  { name: "Olive Oil", section: "Pantry", purchaseUnit: "each", aldiFriendly: true },
  { name: "Peanut Butter", section: "Pantry", purchaseUnit: "jar", aldiFriendly: true },
  { name: "Cereal", section: "Pantry", purchaseUnit: "box", aldiFriendly: true },
  { name: "Oats", section: "Pantry", purchaseUnit: "each", aldiFriendly: true },
  { name: "Honey", section: "Pantry", purchaseUnit: "each", aldiFriendly: true },
  { name: "Vegetable Oil", section: "Pantry", purchaseUnit: "each", aldiFriendly: true },
  { name: "Ketchup", section: "Pantry", purchaseUnit: "each", aldiFriendly: true },
  { name: "Mustard", section: "Pantry", purchaseUnit: "each", aldiFriendly: true },
  { name: "Mayonnaise", section: "Pantry", purchaseUnit: "jar", aldiFriendly: true },
  { name: "Soy Sauce", section: "Pantry", purchaseUnit: "each", aldiFriendly: true },
  { name: "Maple Syrup", section: "Pantry", purchaseUnit: "each", aldiFriendly: true },

  // Canned Goods
  { name: "Black Beans", section: "Canned Goods", purchaseUnit: "can", aldiFriendly: true },
  { name: "Diced Tomatoes", section: "Canned Goods", purchaseUnit: "can", aldiFriendly: true },
  { name: "Corn", section: "Canned Goods", purchaseUnit: "can", aldiFriendly: true },
  { name: "Chicken Broth", section: "Canned Goods", purchaseUnit: "each", aldiFriendly: true },
  { name: "Tomato Sauce", section: "Canned Goods", purchaseUnit: "can", aldiFriendly: true },
  { name: "Tuna", section: "Canned Goods", purchaseUnit: "can", aldiFriendly: true },
  { name: "Refried Beans", section: "Canned Goods", purchaseUnit: "can", aldiFriendly: true },
  { name: "Green Beans", section: "Canned Goods", purchaseUnit: "can", aldiFriendly: true },

  // Baking and Spices
  { name: "Flour", section: "Baking and Spices", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Sugar", section: "Baking and Spices", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Salt", section: "Baking and Spices", purchaseUnit: "each", aldiFriendly: true },
  { name: "Black Pepper", section: "Baking and Spices", purchaseUnit: "each", aldiFriendly: true },
  { name: "Baking Soda", section: "Baking and Spices", purchaseUnit: "box", aldiFriendly: true },
  { name: "Baking Powder", section: "Baking and Spices", purchaseUnit: "each", aldiFriendly: true },
  { name: "Brown Sugar", section: "Baking and Spices", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Vanilla Extract", section: "Baking and Spices", purchaseUnit: "each", aldiFriendly: true },
  { name: "Cinnamon", section: "Baking and Spices", purchaseUnit: "each", aldiFriendly: true },
  { name: "Garlic Powder", section: "Baking and Spices", purchaseUnit: "each", aldiFriendly: true },
  { name: "Chili Powder", section: "Baking and Spices", purchaseUnit: "each", aldiFriendly: true },

  // Snacks
  { name: "Tortilla Chips", section: "Snacks", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Crackers", section: "Snacks", purchaseUnit: "box", aldiFriendly: true },
  { name: "Granola Bars", section: "Snacks", purchaseUnit: "box", aldiFriendly: true },
  { name: "Popcorn", section: "Snacks", purchaseUnit: "box", aldiFriendly: true },
  { name: "Pretzels", section: "Snacks", purchaseUnit: "bag", aldiFriendly: true },
  { name: "Potato Chips", section: "Snacks", purchaseUnit: "bag", aldiFriendly: true },

  // Household (non-food → taxable in WI; 8.3)
  { name: "Paper Towels", section: "Household", purchaseUnit: "each", aldiFriendly: true, food: false, taxable: true },
  { name: "Toilet Paper", section: "Household", purchaseUnit: "each", aldiFriendly: true, food: false, taxable: true },
  { name: "Dish Soap", section: "Household", purchaseUnit: "each", aldiFriendly: true, food: false, taxable: true },
  { name: "Dishwasher Pods", section: "Household", purchaseUnit: "each", aldiFriendly: true, food: false, taxable: true },
  { name: "Trash Bags", section: "Household", purchaseUnit: "box", aldiFriendly: true, food: false, taxable: true },
  { name: "Laundry Detergent", section: "Household", purchaseUnit: "each", aldiFriendly: true, food: false, taxable: true },
  { name: "Aluminum Foil", section: "Household", purchaseUnit: "box", aldiFriendly: true, food: false, taxable: true },
  { name: "Ziploc Bags", section: "Household", purchaseUnit: "box", aldiFriendly: true, food: false, taxable: true },
  { name: "Hand Soap", section: "Household", purchaseUnit: "each", aldiFriendly: true, food: false, taxable: true },
];
