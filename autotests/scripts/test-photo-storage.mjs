import assert from "node:assert/strict";
import { importTestModule } from "./test-module.mjs";

const { createSupabaseStorage, PhotoStorageError } = await importTestModule("lib/photo-storage.ts");
const config = { url: "https://test-project.supabase.co", secretKey: "sb_secret_test-only", bucket: "photos" };
for (const overrides of [
  { url: "http://test-project.supabase.co" }, { url: "https://evil.test" },
  { url: "https://test-project.supabase.co/other" }, { secretKey: "sb_publishable_test" },
  { bucket: "../other" },
]) assert.throws(() => createSupabaseStorage({ ...config, ...overrides }), PhotoStorageError);
assert.throws(() => createSupabaseStorage({...config, url: "invalid URL with sensitive data"}), error =>
  error instanceof PhotoStorageError && !error.message.includes("sensitive"));
const storage = createSupabaseStorage(config);
await assert.rejects(storage.get("../secret"));
const originalFetch = globalThis.fetch;
try {
  for (const status of [401, 403, 429, 500]) {
    globalThis.fetch = async () => new Response("sensitive provider details", { status });
    await assert.rejects(storage.get("wardrobe/photo"), error => !error.message.includes("sensitive") && error.message.includes(String(status)));
    await assert.rejects(storage.put("wardrobe/photo", new Uint8Array([137, 80, 78, 71]), {httpMetadata: {contentType: "image/png"}}),
      error => error instanceof PhotoStorageError && error.operation === "upload" && error.upstreamStatus === status && !error.message.includes("sensitive"));
    await assert.rejects(storage.delete("wardrobe/photo"));
  }
  globalThis.fetch = async () => new Response("<html>not an image</html>", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(storage.get("wardrobe/photo"), error => error instanceof PhotoStorageError && error.operation === "response");
  globalThis.fetch = async () => { throw new Error("network exception with secrets"); };
  await assert.rejects(storage.get("wardrobe/photo"), { message: "Photo storage request failed" });
  await assert.rejects(storage.put("wardrobe/photo", new Uint8Array([137, 80, 78, 71]), {httpMetadata: {contentType: "image/png"}}),
    error => error instanceof PhotoStorageError && error.operation === "request" && !error.message.includes("secret"));
} finally { globalThis.fetch = originalFetch; }
console.log("PASS: Supabase storage validates configuration, rejects invalid files and sanitizes failures");
