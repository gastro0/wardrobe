import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { importTestModule } from "./test-module.mjs";

const runtimeRequire = createRequire(new URL("../node_modules/wrangler/package.json", import.meta.url));
const { build } = runtimeRequire("esbuild");
const { Miniflare, FormData, Response } = runtimeRequire("miniflare");
const auth = await importTestModule("lib/telegram-auth.ts");
const token = "123456:test-only-not-a-real-bot-token";
const origin = "https://telegram-wardrobe.test";
const now = 1_800_000_000_000;
// Sign fixtures independently with Node's crypto, not the production verifier.
function signedData(id, date = Math.floor(Date.now() / 1000), overrides = {}, secretToken = token) {
  const fields = new URLSearchParams({ auth_date: String(date), query_id: "test-query", user: JSON.stringify({ id, first_name: "Тест" }), ...overrides });
  fields.sort();
  const secret = createHmac("sha256", "WebAppData").update(secretToken).digest();
  const hash = createHmac("sha256", secret).update([...fields].map(([key, value]) => `${key}=${value}`).join("\n")).digest("hex");
  fields.set("hash", hash);
  return fields.toString();
}

const valid = signedData(100, now / 1000);
assert.equal((await auth.validateTelegramInitData(valid, token, now)).id, 100);
assert.equal((await auth.validateTelegramInitData(signedData(100, now / 1000, { signature: "new-telegram-field" }), token, now)).id, 100);
for (const data of [valid.replace("test-query", "tampered"), `${valid}&user={}`, signedData(100, now / 1000 - 301), signedData(100, now / 1000 + 31), signedData(-1, now / 1000), signedData(100, now / 1000, { user: "bad json" }), signedData(100, now / 1000, {}, "different-bot"), "x".repeat(16_385)]) {
  assert.equal(await auth.validateTelegramInitData(data, token, now), null);
}
const sessionToken = await auth.createTelegramSession(100, token, origin, now);
assert.equal(await auth.verifyTelegramSession(sessionToken, token, origin, now), 100);
for (const [value, secret, host, time] of [
  [sessionToken.replace(".100.", ".200."), token, origin, now],
  [sessionToken, "wrong", origin, now], [sessionToken, token, "https://other.test", now],
  [sessionToken, token, origin, now + auth.SESSION_SECONDS * 1000],
]) assert.equal(await auth.verifyTelegramSession(value, secret, host, time), null);

const bundle = await build({
  stdin: { contents: `
    import * as session from './app/api/telegram/session/route.ts';
    import * as wardrobe from './app/api/wardrobe/route.ts';
    import * as profile from './app/api/profile/route.ts';
    import * as settings from './app/api/settings/route.ts';
    import * as outfits from './app/api/outfits/route.ts';
    import * as images from './app/api/images/[id]/route.ts';
    import * as weather from './app/api/weather/route.ts';
    import * as cities from './app/api/cities/route.ts';
    export default {fetch(request) {
      const path = new URL(request.url).pathname;
      if(path.startsWith('/api/images/'))return images.GET(request,{params:Promise.resolve({id:path.split('/').pop()})});
      const routes = {'/api/telegram/session':session,'/api/wardrobe':wardrobe,'/api/profile':profile,'/api/settings':settings,'/api/outfits':outfits,'/api/weather':weather,'/api/cities':cities};
      return routes[path]?.[request.method]?.(request) ?? new Response('Not found',{status:404});
    }};`, resolveDir: process.cwd(), sourcefile: "telegram-test-worker.ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022",
  conditions: ["workerd", "worker", "browser"], external: ["cloudflare:workers"],
});
const options = {
  modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"], r2Buckets: ["BUCKET"],
};
for (const provider of ["r2", "supabase"]) {
const photos = new Map();
let storageCalls = 0;
let rejectUpload = false;
const worker = new Miniflare({ ...options,
  bindings: { TELEGRAM_BOT_TOKEN: token, TELEGRAM_BOT_USERNAME: "forma_test_bot", TELEGRAM_OWNER_ID: "100",
    ...(provider === "supabase" ? { PHOTO_STORAGE: "supabase", SUPABASE_URL: "https://test-project.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test-only", SUPABASE_STORAGE_BUCKET: "photos" } : {}),
  },
  outboundService: async request => {
    storageCalls++;
    assert.equal(new URL(request.url).origin, "https://test-project.supabase.co");
    assert.equal(request.headers.get("apikey"), "sb_secret_test-only");
    const path = new URL(request.url).pathname;
    const prefix = "/storage/v1/object/photos/";
    if (request.method === "DELETE") {
      assert.equal(path, prefix.slice(0, -1));
      const { prefixes } = await request.json();
      for (const key of prefixes) photos.delete(key);
      return Response.json([]);
    }
    assert.ok(path.startsWith(prefix));
    const key = path.slice(prefix.length);
    if (request.method === "POST") {
      if (rejectUpload) return Response.json({ message: "private upstream detail" }, { status: 503 });
      assert.equal(request.headers.get("x-upsert"), "false");
      photos.set(key, { bytes: await request.arrayBuffer(), type: request.headers.get("content-type") });
      return Response.json({ Key: key });
    }
    const photo = photos.get(key);
    return photo ? new Response(photo.bytes, { headers: { "Content-Type": photo.type } }) : Response.json({ code: "NoSuchKey" }, { status: 400 });
  },
});
try {
  const database = await worker.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter(file => file.endsWith(".sql")).sort()) {
    for (const sql of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint").filter(sql => sql.trim())) await database.prepare(sql).run();
  }
  const request = (path, method = "GET", body, cookie = "", headers = {}) => worker.dispatchFetch(origin + path, {
    method, headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = (id, data = signedData(id), cookie = "") => request("/api/telegram/session", "POST", { initData: data }, cookie);
  for (const path of ["/api/wardrobe", "/api/profile", "/api/images/any", "/api/weather?lat=0&lon=0", "/api/cities?q=test"]) {
    assert.equal((await request(path)).status, 401, `${path} requires authentication`);
  }
  for (const path of ["/api/wardrobe", "/api/profile", "/api/settings", "/api/outfits"]) assert.equal((await request(path, "POST", {})).status, 401);
  assert.equal((await (await request("/api/telegram/session")).json()).authenticated, false);
  assert.equal((await login(100, signedData(100, Math.floor(Date.now() / 1000) - 301))).status, 401);
  assert.equal((await request("/api/telegram/session", "POST", { initData: signedData(100) }, "", { Origin: "https://evil.test" })).status, 403);
  assert.equal((await request("/api/telegram/session", "POST", { initData: signedData(100) }, "", { Origin: "" })).status, 403);
  assert.equal((await request("/api/telegram/session", "POST", { initData: "x".repeat(33_000) })).status, 413);
  const aliceLogin = await login(100);
  assert.equal(aliceLogin.status, 200);
  const cookieHeader = aliceLogin.headers.get("set-cookie");
  for (const attribute of ["HttpOnly", "Secure", "SameSite=None", "Partitioned", "Path=/"]) assert.ok(cookieHeader.includes(attribute));
  const alice = cookieHeader.split(";")[0];
  const bob = (await login(200)).headers.get("set-cookie").split(";")[0];
  const charlie = (await login(300)).headers.get("set-cookie").split(";")[0];
  const oldData = signedData(100, Math.floor(Date.now() / 1000) - 600);
  const reload = await login(100, oldData, alice);
  assert.equal(reload.status, 200);
  assert.equal(reload.headers.get("set-cookie"), null, "Old initData cannot extend session expiry");
  assert.equal((await login(100, oldData, bob)).status, 401, "Account switch cannot reuse another account's session");
  assert.equal((await login(100, oldData)).status, 401);
  assert.equal((await request("/api/wardrobe", "GET", undefined, `${alice}; ${bob}`)).status, 401);
  await database.prepare("INSERT INTO wardrobe_profiles (user_id,name,gender) VALUES (?,?,?)").bind("private-wardrobe", "Старый профиль", "unspecified").run();
  assert.equal((await (await request("/api/profile", "GET", undefined, alice)).json()).profile.name, "Старый профиль");
  assert.equal((await (await request("/api/profile", "GET", undefined, bob)).json()).profile, null);
  await request("/api/profile", "POST", { name: "Боб", gender: "unspecified" }, bob);
  await request("/api/settings", "POST", { name: "Москва", latitude: 55, longitude: 37 }, alice);
  await request("/api/settings", "POST", { name: "Казань", latitude: 55, longitude: 49 }, bob);
  const details = { name: "Личная вещь", category: "tshirt", color: "Белый", minTemp: 10, maxTemp: 30, rainproof: false, windproof: false };
  const upload = async cookie => {
    const form = new FormData();
    form.append("data", JSON.stringify(details));
    form.append("photo", new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "test.png");
    const response = await worker.dispatchFetch(origin + "/api/wardrobe", { method: "POST", headers: { Origin: origin, Cookie: cookie }, body: form });
    assert.equal(response.status, 201);
    return (await response.json()).item;
  };
  const item = await upload(alice);
  const bobItem = await upload(bob);
  const aliceOutfit = (await (await request("/api/outfits", "POST", { name: "Личный образ", itemIds: [item.id] }, alice)).json()).outfit;
  assert.equal((await request(item.image, "GET", undefined, alice)).status, 200);
  const callsBeforeDeniedRead = storageCalls;
  assert.equal((await request(item.image, "GET", undefined, bob)).status, 404);
  assert.equal(storageCalls, callsBeforeDeniedRead, "Denied reads never reach photo storage");
  assert.equal((await request("/api/wardrobe", "PATCH", { ...details, id: item.id }, bob)).status, 404);
  assert.equal((await request("/api/wardrobe", "DELETE", { id: item.id }, bob)).status, 404);
  assert.equal((await request("/api/outfits", "POST", { name: "Чужие вещи", itemIds: [item.id] }, bob)).status, 400);
  assert.equal((await request("/api/outfits", "POST", { id: aliceOutfit.id, name: "Подмена", itemIds: [bobItem.id] }, bob)).status, 404);
  await request("/api/outfits", "DELETE", { id: aliceOutfit.id }, bob);
  const aliceData = await (await request("/api/wardrobe", "GET", undefined, alice)).json();
  assert.equal(aliceData.outfits.length, 1);
  assert.equal(aliceData.city.name, "Москва");
  assert.equal(aliceData.items.length, 1);
  const bobData = await (await request("/api/wardrobe", "GET", undefined, bob, { "oai-authenticated-user-id": "private-wardrobe", "x-telegram-user-id": "100" })).json();
  assert.deepEqual(bobData.items.map(item => item.id), [bobItem.id]);
  assert.equal(bobData.city.name, "Казань");
  assert.equal(bobData.profile.name, "Боб");
  assert.equal(bobData.outfits.length, 0);
  const empty = await (await request("/api/wardrobe", "GET", undefined, charlie)).json();
  assert.deepEqual(empty, { profile: null, items: [], outfits: [], city: null });
  assert.equal((await request("/api/profile", "POST", { name: "CSRF", gender: "male" }, alice, { Origin: "https://evil.test" })).status, 403);
  await request("/api/wardrobe", "DELETE", { id: bobItem.id }, bob);
  assert.equal((await request(item.image, "GET", undefined, alice)).status, 200);
  if (provider === "supabase") {
    assert.equal(photos.size, 1, "Deletion removes only the owner's photo");
    photos.clear();
    assert.equal((await request(item.image, "GET", undefined, alice)).status, 404);
    rejectUpload = true;
    const beforeFailure = storageCalls;
    const form = new FormData();
    form.append("data", JSON.stringify(details));
    form.append("photo", new Blob([Uint8Array.from([137, 80, 78, 71])]), "test.png");
    const failed = await worker.dispatchFetch(origin + "/api/wardrobe", { method: "POST", headers: { Origin: origin, Cookie: alice }, body: form });
    assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes("private upstream detail"));
    assert.equal(storageCalls, beforeFailure + 1, "Failed uploads do not delete existing objects");
    assert.equal((await (await request("/api/wardrobe", "GET", undefined, alice)).json()).items.length, 1);
  }
} finally { await worker.dispose(); }
}

const unconfigured = new Miniflare({ ...options, bindings: { ALLOW_LOCAL_DEVELOPMENT: "true" } });
try {
  assert.equal((await unconfigured.dispatchFetch(origin + "/api/wardrobe")).status, 503, "Local preview never bypasses auth on public hosts");
} finally { await unconfigured.dispose(); }
console.log("PASS: Telegram signatures, session expiry, CSRF, protected photos, multi-user isolation and explicit legacy owner mapping");
