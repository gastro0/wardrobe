import {categoryGroup, type CategoryGroup, type Item} from "./wardrobe";

// Mix categories independently, so pieces from different saved looks can meet.
export function randomOutfit(items: Item[], previous: string[] = [], random = Math.random): Item[] {
  const pool: Record<CategoryGroup, Item[]> = {top: [], bottom: [], dress: [], shoes: [], outerwear: [], accessory: []};
  for (const item of items) pool[categoryGroup(item.category)].push(item);
  const pick = (choices: Item[]) => choices[Math.floor(random() * choices.length)];
  const separates = [...(pool.top.length ? [pick(pool.top)] : []), ...(pool.bottom.length ? [pick(pool.bottom)] : [])];
  const useDress = pool.dress.length > 0 && (!separates.length || random() < 0.5);
  const selected = useDress ? [pick(pool.dress)] : separates;
  for (const group of ["shoes", "outerwear", "accessory"] as const) {
    if (pool[group].length) selected.push(pick(pool[group]));
  }
  // A refresh must change the result whenever another combination exists.
  if (selected.length === previous.length && selected.every(item => previous.includes(item.id))) {
    const replaceable = selected.filter(item => pool[categoryGroup(item.category)].some(other => other.id !== item.id));
    if (replaceable.length) {
      const old = pick(replaceable);
      selected[selected.indexOf(old)] = pick(pool[categoryGroup(old.category)].filter(item => item.id !== old.id));
    } else if (pool.dress.length && separates.length) {
      return [...(useDress ? separates : [pick(pool.dress)]), ...selected.filter(item => !["top", "bottom", "dress"].includes(categoryGroup(item.category)))];
    }
  }
  return selected;
}
