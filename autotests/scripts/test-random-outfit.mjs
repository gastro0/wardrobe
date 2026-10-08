import assert from "node:assert/strict";
import {importTestModule} from "./test-module.mjs";
const {randomOutfit} = await importTestModule("lib/random-outfit.ts");
const {categoryGroup} = await importTestModule("lib/wardrobe.ts");
const item = (id, category) => ({id, category});
const items = [item("top1", "tshirt"), item("top2", "shirt"), item("bottom", "jeans"), item("dress", "dress"), item("shoe", "sneakers"), item("coat", "coat"), item("bag", "bag")];
assert.deepEqual(randomOutfit([]), []);
assert.deepEqual(randomOutfit([items[0]], [items[0].id]), [items[0]]);
// Even a repeated random draw changes the look, using another garment or base.
for (const pool of [items, items.filter(i => i.id !== "top2"), items.filter(i => i.id !== "dress")]) {
  let previous = [];
  for (let turn = 0; turn < 100; turn++) {
    const result = randomOutfit(pool, previous, () => 0);
    const ids = result.map(i => i.id);
    assert.notDeepEqual([...ids].sort(), [...previous].sort());
    assert.equal(new Set(ids).size, ids.length);
    const groups = result.map(i => categoryGroup(i.category));
    assert.equal(new Set(groups).size, groups.length);
    assert.ok(!(groups.includes("dress") && (groups.includes("top") || groups.includes("bottom"))));
    assert.ok(ids.every(id => pool.some(i => i.id === id)));
    previous = ids;
  }
}
assert.ok(randomOutfit(items, [], () => 0).some(i => i.id === "dress"));
assert.ok(randomOutfit(items, [], () => .99).some(i => i.id === "top2"));
assert.ok(!randomOutfit(items.slice(1), ["top1"]).some(i => i.id === "top1"));
console.log("Random outfit checks passed");
