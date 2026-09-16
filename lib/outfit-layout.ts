import {categoryGroup, tagKey, type Item} from "./wardrobe";

export type OutfitSlot = "head" | "upper" | "lower" | "full" | "feet" | "side";

export function outfitSlot(item: Item): OutfitSlot {
  const group = categoryGroup(item.category);
  if (group === "accessory") {
    const description = tagKey([item.name, ...(item.tags ?? [])].join(" "));
    return item.category === "headwear" || /(?:кепк|шапк|шляп|панам|берет|бейсболк|козырек|балаклав|\b(?:cap|hat|beanie|beret)\b)/u.test(description) ? "head" : "side";
  }
  return ({top: "upper", outerwear: "upper", bottom: "lower", dress: "full", shoes: "feet"} as const)[group];
}

export function groupOutfit(items: Item[]): Record<OutfitSlot, Item[]> {
  const groups: Record<OutfitSlot, Item[]> = {head: [], upper: [], lower: [], full: [], feet: [], side: []};
  for (const item of items) groups[outfitSlot(item)].push(item);
  // Put outer layers first, regardless of the order in which items were added.
  groups.upper.sort((a, b) => Number(categoryGroup(b.category) === "outerwear") - Number(categoryGroup(a.category) === "outerwear"));
  return groups;
}
