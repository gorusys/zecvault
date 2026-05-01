export type GoalCategory =
  | "trip" | "ring" | "house" | "car"
  | "emer" | "gift" | "edu" | "tech" | "custom";

export interface CategoryDef {
  id: GoalCategory;
  name: string;
  emoji: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "trip",   name: "Experiences",      emoji: "🌍" },
  { id: "ring",   name: "Wedding",          emoji: "💒" },
  { id: "house",  name: "Home Upgrade",     emoji: "🏠" },
  { id: "car",    name: "EV Fund",          emoji: "🔋" },
  { id: "emer",   name: "Safety Buffer",    emoji: "🧯" },
  { id: "gift",   name: "Family Moments",   emoji: "🧸" },
  { id: "edu",    name: "Skills & Courses", emoji: "📚" },
  { id: "tech",   name: "Creator + AI Gear",emoji: "🤖" },
  { id: "custom", name: "Custom",     emoji: "🎯" },
];

export function categoryOf(id: GoalCategory): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
