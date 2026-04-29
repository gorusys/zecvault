export type GoalCategory =
  | "trip" | "ring" | "house" | "car"
  | "emer" | "gift" | "edu" | "tech" | "custom";

export interface CategoryDef {
  id: GoalCategory;
  name: string;
  emoji: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "trip",   name: "Travel",     emoji: "✈️" },
  { id: "ring",   name: "Ring",       emoji: "💍" },
  { id: "house",  name: "Home",       emoji: "🏡" },
  { id: "car",    name: "Car",        emoji: "🚗" },
  { id: "emer",   name: "Emergency",  emoji: "🛡️" },
  { id: "gift",   name: "Gift",       emoji: "🎁" },
  { id: "edu",    name: "Education",  emoji: "🎓" },
  { id: "tech",   name: "Tech",       emoji: "💻" },
  { id: "custom", name: "Custom",     emoji: "🎯" },
];

export function categoryOf(id: GoalCategory): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
