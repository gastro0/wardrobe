import assert from "node:assert/strict";
import {importTestModule} from "./test-module.mjs";
const {outfitSlot, groupOutfit} = await importTestModule("lib/outfit-layout.ts");
const item = (id, category, name = id, tags = []) => ({id, category, name, tags});

for (const name of ["Синяя кепка", "Шапка бини", "Летняя панама", "Берет", "Baseball cap"]) {
  assert.equal(outfitSlot(item(name, "accessory", name)), "head");
}
assert.equal(outfitSlot(item("favorite", "accessory", "Любимая вещь", ["Шапка"])), "head");
assert.equal(outfitSlot(item("legacy", "headwear", "Мой аксессуар")), "head");
for (const name of ["Сумка", "Часы", "Очки"]) assert.equal(outfitSlot(item(name, "accessory")), "side");
assert.equal(outfitSlot(item("boots", "boots")), "feet");
assert.equal(outfitSlot(item("jeans", "jeans")), "lower");
assert.equal(outfitSlot(item("dress", "dress")), "full");
assert.equal(outfitSlot(item("jumpsuit", "jumpsuit")), "full");

const pieces = [item("shoes", "shoes"), item("tee", "tshirt"), item("jeans", "jeans"), item("hat", "headwear"), item("coat", "outerwear"), item("bag", "bag")];
const groups = groupOutfit(pieces);
assert.deepEqual(groups.upper.map(i => i.id), ["coat", "tee"]);
assert.deepEqual(groups.head.map(i => i.id), ["hat"]);
assert.deepEqual(groups.lower.map(i => i.id), ["jeans"]);
assert.equal(Object.values(groups).flat().length, pieces.length);
assert.deepEqual(groupOutfit([...pieces].reverse()), groups);
assert.equal(Object.values(groupOutfit([])).flat().length, 0);
const largeLook = Array.from({length: 30}, (_, index) => item(String(index), "accessory"));
assert.equal(groupOutfit(largeLook).side.length, 30);
console.log("Outfit layout checks passed");
