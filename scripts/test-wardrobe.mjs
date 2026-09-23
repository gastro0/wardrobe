import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
// Use the simulator and bundler installed with the project's Wrangler runtime.
const runtimeRequire = createRequire(new URL("../node_modules/wrangler/package.json", import.meta.url));
const { build } = runtimeRequire("esbuild");
const { Miniflare, FormData } = runtimeRequire("miniflare");

const compiled = ts.transpileModule(fs.readFileSync("lib/wardrobe.ts", "utf8"), {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
}).outputText;
const wardrobe = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const weather = {temperature: 25, feels: 25, code: 0, wind: 2, rain: 0, probability: 0, isDay: true};
const item = (category, extra = {}) => ({id: category, name: category, category, color: "", minTemp: -30, maxTemp: 40, rainproof: false, windproof: false, image: "", ...extra});
assert.deepEqual(wardrobe.normalizeTags(["  Зимние   ботинки ","зимние ботинки","", "Тёплые", "теплые"]),["Зимние ботинки","Тёплые"]);
assert.equal(wardrobe.tagTemperatureRange("shoes","Пуховик"),undefined);
assert.equal(wardrobe.tagTemperatureRange("outerwear","Мой особый тип"),undefined);
assert.deepEqual(wardrobe.tagTemperatureRange("downjacket"," пуховик "),[-20,5]);
assert.deepEqual(wardrobe.temperatureSuggestion("outerwear",["  ПУХОВИК ","Любимая вещь"]).range,[-20,5]);
assert.deepEqual(wardrobe.temperatureSuggestion("shoes",["Сандалии"]).range,[22,38]);
assert.deepEqual(wardrobe.temperatureSuggestion("outerwear",["Ветровка","ветровка"]).range,[10,20]);
assert.deepEqual(wardrobe.temperatureSuggestion("outerwear",["Неизвестный тип"]).range,wardrobe.categoryRange("outerwear"));
assert.equal(wardrobe.temperatureSuggestion("shoes",["Пуховик"]).source,"category");
assert.equal(wardrobe.temperatureSuggestion("outerwear",["Пуховик","Ветровка"]).source,"conflict");
assert.equal(wardrobe.temperatureSuggestion("outerwear",["Пуховик","Ветровка"]).range,null);
assert.deepEqual(wardrobe.temperatureSuggestion("outerwear",[]).range,wardrobe.categoryRange("outerwear"));
for (const [tag,feels,expected] of [["Пуховик",-10,true],["Пуховик",25,false],["Ветровка",-10,false],["Ветровка",15,true]]) {
  const [minTemp,maxTemp]=wardrobe.tagTemperatureRange("outerwear",tag);
  const garment=item("outerwear",{tags:[tag],minTemp,maxTemp});
  assert.equal(wardrobe.recommend([garment],{...weather,feels}).items.some(i=>i.id===garment.id),expected);
}
const conciseCategories = wardrobe.availableCategories("unspecified");
assert.equal(conciseCategories.length, 14);
assert.equal(wardrobe.availableCategories("male").length, 11);
assert.equal(new Set(conciseCategories.map(([,label]) => label)).size, 14);
assert.equal(conciseCategories.some(([,label]) => /друг/i.test(label)), false);
for (const group of ["shoes", "accessory"]) {
  assert.deepEqual(conciseCategories.filter(([key]) => wardrobe.categoryGroup(key) === group).map(([key]) => key), [group]);
}
const legacyCategories = {
  polo:"tshirt",tank:"tshirt",longsleeve:"tshirt",top:"tshirt",
  sweatshirt:"hoodie",cardigan:"sweater",leggings:"trousers",bottom:"trousers",
  jacket:"outerwear",coat:"outerwear",downjacket:"outerwear",raincoat:"outerwear",blazer:"outerwear",vest:"outerwear",
  sneakers:"shoes",boots:"shoes",loafers:"shoes",sandals:"shoes",
  bag:"accessory",headwear:"accessory",scarf:"accessory",gloves:"accessory",belt:"accessory",
};
for (const category of ["dress", "skirt", "blouse"]) {
  assert.equal(wardrobe.availableCategories("male").some(([key]) => key === category), false);
  assert.equal(wardrobe.availableCategories("female").some(([key]) => key === category), true);
  assert.equal(wardrobe.availableCategories("unspecified").some(([key]) => key === category), true);
}
for (const category of ["tshirt", "hoodie", "jeans", "jacket", "boots", "bag"]) {
  for (const gender of ["male", "female", "unspecified"]) assert.equal(wardrobe.categoryAllowed(category, gender), true);
}
const everyday = [item("tshirt"), item("jeans"), item("sneakers")];
assert.equal(wardrobe.recommend(everyday, weather, 0, "male").complete, true);
assert.equal(wardrobe.outfitSuitable(everyday, weather, "male"), true);
const skirts = [item("blouse"), item("skirt"), item("loafers")];
assert.equal(wardrobe.outfitSuitable(skirts, weather, "female"), true);
assert.equal(wardrobe.outfitSuitable(skirts, weather, "male"), false);
const dresses = [item("dress"), item("sandals")];
assert.equal(wardrobe.recommend(dresses, weather, 0, "female").complete, true);
assert.equal(wardrobe.recommend(dresses, weather, 0, "male").items.some(i => i.category === "dress"), false);
assert.equal(wardrobe.recommend([item("jumpsuit"), item("sneakers")], weather, 0, "male").complete, true);
const winter = [item("tshirt", {minTemp: 18}), item("trousers"), item("boots", {rainproof: true}), item("downjacket", {rainproof: true, windproof: true})];
const cold = {...weather, feels: -15, wind: 10, code: 71, rain: 1};
assert.equal(wardrobe.recommend(winter, cold, 0, "male").complete, true);
assert.equal(wardrobe.outfitSuitable(winter, cold, "male"), true);
assert.equal(wardrobe.outfitSuitable([item("top"), item("bottom"), item("shoes")], weather), true);

// Exercise real route handlers against an isolated in-memory D1/R2 instance.
const bundle = await build({
  stdin: {contents: `
    import * as profile from './app/api/profile/route.ts';
    import * as wardrobe from './app/api/wardrobe/route.ts';
    import * as settings from './app/api/settings/route.ts';
    import * as outfits from './app/api/outfits/route.ts';
    export default {fetch(request) {
      const handlers = {'/api/profile':profile,'/api/wardrobe':wardrobe,'/api/settings':settings,'/api/outfits':outfits};
      const handler = handlers[new URL(request.url).pathname]?.[request.method];
      return handler ? handler(request) : new Response('Not found', {status:404});
    }};`, resolveDir: process.cwd(), sourcefile: "wardrobe-test-worker.ts"},
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022",
  conditions: ["workerd", "worker", "browser"], external: ["cloudflare:workers"],
});
const worker = new Miniflare({
  modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"], r2Buckets: ["BUCKET"], bindings: {ALLOW_LOCAL_DEVELOPMENT: "true"},
});
try {
  const database = await worker.getD1Database("DB");
  for (const file of fs.readdirSync("drizzle").filter(file => file.endsWith(".sql")).sort()) {
    for (const sql of fs.readFileSync(path.join("drizzle", file), "utf8").split("--> statement-breakpoint").filter(sql => sql.trim())) {
      await database.prepare(sql).run();
    }
  }
  const request = (url, method = "GET", data) => worker.dispatchFetch("http://127.0.0.1" + url, {
    method, headers: {"Content-Type":"application/json", Origin:"http://127.0.0.1"},
    ...(data === undefined ? {} : {body: JSON.stringify(data)}),
  });
  assert.equal((await (await request("/api/profile")).json()).profile, null);
  assert.equal((await request("/api/profile", "POST", {name:" ",gender:"male"})).status, 400);
  assert.equal((await request("/api/profile", "POST", {name:"Test",gender:"invalid"})).status, 400);
  assert.equal((await request("/api/profile", "POST", {name:"x".repeat(61),gender:"male"})).status, 400);
  assert.equal((await worker.dispatchFetch("http://127.0.0.1/api/profile", {
    method:"POST", headers:{Origin:"https://other.test","Content-Type":"application/json"},
    body:JSON.stringify({name:"Test",gender:"male"}),
  })).status, 403);
  for (const gender of ["male", "female", "unspecified"]) {
    assert.equal((await request("/api/profile", "POST", {name:"  Test  ", gender})).status, 200);
    assert.deepEqual((await (await request("/api/profile")).json()).profile, {name:"Test",gender});
  }
  const city = {name:"Kazan", latitude:55.78874, longitude:49.12214};
  assert.equal((await request("/api/settings", "POST", city)).status, 200);
  await request("/api/profile", "POST", {name:"Updated",gender:"male"});
  const loaded = await (await request("/api/wardrobe")).json();
  assert.deepEqual(loaded.city, city);
  assert.deepEqual(loaded.profile, {name:"Updated",gender:"male"});
  const details = {name:"Test garment",color:"",minTemp:10,maxTemp:30,rainproof:false,windproof:false};
  const upload = async (category, extra = {}) => {
    const form = new FormData();
    form.append("data", JSON.stringify({...details,category,...extra}));
    form.append("photo", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64")], {type:"image/png"}), "photo.png");
    return worker.dispatchFetch("http://127.0.0.1/api/wardrobe", {method:"POST",headers:{Origin:"http://127.0.0.1"},body:form});
  };
  assert.equal((await upload("dress")).status, 400);
  assert.equal((await upload("skirt")).status, 400);
  const created = await upload("jeans");
  assert.equal(created.status, 201);
  const saved = (await created.json()).item;
  assert.deepEqual(saved.tags,[]);
  const suggestedRange=wardrobe.temperatureSuggestion("outerwear",[" Пуховик ","пуховик","Любимая вещь"]).range;
  const taggedUpload=await upload("outerwear",{tags:[" Пуховик ","пуховик","Любимая вещь"],minTemp:suggestedRange[0],maxTemp:suggestedRange[1]});
  assert.equal(taggedUpload.status,201);
  const tagged=(await taggedUpload.json()).item;
  assert.deepEqual(tagged.tags,["Пуховик","Любимая вещь"]);
  const loadTagged=async()=>(await (await request("/api/wardrobe")).json()).items.find(i=>i.id===tagged.id);
  assert.deepEqual((await loadTagged()).tags,tagged.tags);
  assert.equal((await loadTagged()).minTemp,-20);
  assert.equal(wardrobe.suitable(await loadTagged(),{...weather,feels:-10}),true);
  assert.equal(wardrobe.suitable(await loadTagged(),{...weather,feels:25}),false);
  assert.equal((await request("/api/wardrobe","PATCH",{...details,id:tagged.id,category:"outerwear"})).status,200);
  assert.deepEqual((await loadTagged()).tags,tagged.tags,"Old clients must preserve existing tags");
  assert.equal((await request("/api/wardrobe","PATCH",{...details,id:tagged.id,category:"outerwear",tags:[" Ветровка "]})).status,200);
  assert.deepEqual((await loadTagged()).tags,["Ветровка"]);
  for(const tags of [[""],["x".repeat(41)],Array.from({length:9},(_,i)=>String(i)),[42],"Пуховик"]){
    assert.equal((await request("/api/wardrobe","PATCH",{...details,id:tagged.id,category:"outerwear",tags})).status,400);
    assert.equal((await upload("outerwear",{tags})).status,400);
  }
  assert.equal((await request("/api/wardrobe","PATCH",{...details,id:tagged.id,category:"outerwear",tags:[]})).status,200);
  assert.deepEqual((await loadTagged()).tags,[]);
  assert.equal((await request("/api/wardrobe", "PATCH", {...details,id:saved.id,category:"dress"})).status, 400);
  assert.equal((await request("/api/wardrobe", "PATCH", {...details,id:saved.id,category:"trousers"})).status, 200);
  const legacyIds = Object.fromEntries(Object.keys(legacyCategories).map(category => [category,crypto.randomUUID()]));
  for (const oldCategory of Object.keys(legacyCategories)) {
    await database.prepare("INSERT INTO wardrobe_items (id,user_id,name,category,color,min_temp,max_temp,rainproof,windproof,image_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(legacyIds[oldCategory],"private-wardrobe",oldCategory,oldCategory,"White",-21,4,1,1,"wardrobe/legacy-" + oldCategory,"2026-01-01T00:00:00.000Z").run();
  }
  const storedBefore = await database.prepare("SELECT * FROM wardrobe_items ORDER BY id").all();
  const normalized = (await (await request("/api/wardrobe")).json()).items;
  for (const [oldCategory,mainCategory] of Object.entries(legacyCategories)) {
    const garment = normalized.find(i => i.id === legacyIds[oldCategory]);
    assert.equal(garment.category, mainCategory);
    assert.deepEqual(garment.tags,[]);
    assert.equal(garment.image,"/api/images/" + legacyIds[oldCategory]);
    assert.equal(garment.minTemp,-21); assert.equal(garment.maxTemp,4);
    assert.equal(garment.rainproof,true); assert.equal(garment.windproof,true);
  }
  assert.deepEqual((await database.prepare("SELECT * FROM wardrobe_items ORDER BY id").all()).results,storedBefore.results,"Grouping must preserve stored photographs and clothing metadata");
  const legacyOutfitIds = [legacyIds.coat,legacyIds.boots,legacyIds.bag];
  assert.equal((await request("/api/outfits", "POST", {name:"Legacy outfit",itemIds:legacyOutfitIds})).status,200);
  assert.deepEqual((await (await request("/api/wardrobe")).json()).outfits.find(o => o.name === "Legacy outfit").itemIds,legacyOutfitIds);
  const oldUpload = await upload("boots");
  assert.equal(oldUpload.status,201);
  const normalizedUpload = (await oldUpload.json()).item;
  assert.equal(normalizedUpload.category,"shoes");
  assert.equal((await database.prepare("SELECT category FROM wardrobe_items WHERE id=?").bind(normalizedUpload.id).first()).category,"shoes");
  assert.equal((await request("/api/wardrobe", "PATCH", {...details,id:normalizedUpload.id,category:"coat"})).status,200);
  assert.equal((await database.prepare("SELECT category FROM wardrobe_items WHERE id=?").bind(normalizedUpload.id).first()).category,"outerwear");
  await request("/api/profile", "POST", {name:"Updated",gender:"female"});
  const dress = await upload("dress");
  assert.equal(dress.status, 201);
  const dressId = (await dress.json()).item.id;
  assert.equal((await request("/api/outfits", "POST", {name:"Dress outfit",itemIds:[dressId,saved.id]})).status, 200);
  const before = (await (await request("/api/wardrobe")).json()).items;
  await request("/api/profile", "POST", {name:"Updated",gender:"male"});
  assert.equal((await request("/api/outfits", "POST", {name:"Dress outfit",itemIds:[dressId]})).status, 400);
  assert.deepEqual((await (await request("/api/wardrobe")).json()).items, before, "Profile changes must preserve existing clothes");
  const storage = await worker.getR2Bucket("BUCKET");
  const photo = await database.prepare("SELECT image_key FROM wardrobe_items WHERE id=?").bind(normalizedUpload.id).first();
  assert.ok(await storage.get(photo.image_key));
  const outfitsBeforeDelete = (await (await request("/api/wardrobe")).json()).outfits;
  assert.equal((await request("/api/wardrobe","DELETE",{id:normalizedUpload.id})).status,200);
  const afterDelete = await (await request("/api/wardrobe")).json();
  assert.equal(afterDelete.items.some(i=>i.id===normalizedUpload.id),false);
  assert.equal(afterDelete.items.length,before.length-1);
  assert.deepEqual(afterDelete.outfits,outfitsBeforeDelete,"Deleting clothing must preserve saved outfits");
  assert.equal(await storage.get(photo.image_key),null);
  assert.equal((await request("/api/wardrobe","DELETE",{id:normalizedUpload.id})).status,404);
  console.log("PASS: concise gender categories, legacy grouping with metadata/outfits preserved, normalized uploads/edits, weather selection, profile persistence and validation");
} finally { await worker.dispose(); }
