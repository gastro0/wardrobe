import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile, writeFile, access, readdir} from "node:fs/promises";
import {createServer} from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtimeRequire = createRequire(new URL("../node_modules/wrangler/package.json", import.meta.url));
const {build} = runtimeRequire("esbuild");
const outdir = path.join(root, ".sites-runtime/photo-test");
const bundle = await build({entryPoints: [path.join(root, "lib/clothing-photo.ts"), path.join(root, "lib/clothing-photo.worker.ts")], bundle: true, splitting: true, format: "esm", platform: "browser", target: "chrome111", outdir, write: false, plugins: [{name: "worker-entry", setup(build) {
  build.onResolve({filter: /\?worker$/}, () => ({path: "photo-worker", namespace: "worker-entry"}));
  build.onLoad({filter: /.*/, namespace: "worker-entry"}, () => ({contents: 'export default class PhotoWorker extends Worker { constructor() { super(new URL("/clothing-photo.worker.js", location.href), {type: "module"}); } }', loader: "js"}));
}}]});
const modules = new Map(bundle.outputFiles.map(file => ["/" + path.relative(outdir, file.path).replaceAll("\\", "/"), file.contents]));
if (process.argv.includes("--production-worker")) {
  const assetDir = path.join(root, "dist/client/_next/static");
  const workerFile = (await readdir(assetDir)).find(name => /^clothing-photo\.worker-.*\.js$/.test(name));
  assert.ok(workerFile, "Build the application before testing the production worker");
  modules.set("/clothing-photo.worker.js", await readFile(path.join(assetDir, workerFile)));
  console.log("Testing bundled production worker:", workerFile);
}
let failManifestOnce = true;
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Photo algorithm test</title>"); return; }
    const modulePath = pathname === "/clothing-photo.worker.ts" ? "/clothing-photo.worker.js" : pathname;
    if (modules.has(modulePath)) { response.setHeader("Content-Type", "text/javascript"); response.end(modules.get(modulePath)); return; }
    if (/^\/background-removal\/1\.7\.0\/(?:[a-f0-9]{64}|resources\.json)$/.test(pathname)) {
      if (pathname.endsWith("resources.json") && failManifestOnce) { failManifestOnce = false; response.writeHead(503).end(); return; }
      response.setHeader("Content-Type", pathname.endsWith(".json") ? "application/json" : "application/octet-stream");
      response.end(await readFile(path.join(root, "public", pathname))); return;
    }
    response.writeHead(404).end();
  } catch (error) { console.error(error); response.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  const candidates = [process.env.PHOTO_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
  let executablePath;
  for (const candidate of candidates) { try { await access(candidate); executablePath = candidate; break; } catch {} }
  if (!executablePath) throw new Error("Set PHOTO_TEST_BROWSER to an installed Chromium browser executable.");
  browser = await chromium.launch({executablePath, headless: true});
  const page = await browser.newPage();
  page.on("pageerror", error => console.error("Browser error:", error));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const fixtures = await Promise.all(["cream-tshirt.jpg", "olive-jacket.png"].map(async name => ({name, bytes: [...await readFile(path.join(root, "public/images", name))]})));
  const results = await page.evaluate(async fixtures => {
    const {removeClothingBackground, foregroundBounds} = await import("/clothing-photo.js");
    const white = new Uint8ClampedArray(20 * 20 * 4);
    white.set([255, 255, 255, 255], (10 * 20 + 10) * 4);
    if (!foregroundBounds(white, 20, 20)) throw new Error("White foreground was discarded");
    if (foregroundBounds(new Uint8ClampedArray(20 * 20 * 4), 20, 20)) throw new Error("Empty image has foreground");
    let rejected = false;
    try { await removeClothingBackground(new File(["invalid"], "broken.jpg", {type: "image/jpeg"})); } catch { rejected = true; }
    if (!rejected) throw new Error("Broken image was accepted");
    let loadingRejected = false;
    try { await removeClothingBackground(new File([new Uint8Array(fixtures[0].bytes)], fixtures[0].name, {type: "image/jpeg"})); } catch { loadingRejected = true; }
    if (!loadingRejected) throw new Error("Asset loading failure was not reported");
    // Concurrent calls also exercise queue recovery after a failed photograph.
    return Promise.all(fixtures.map(async fixture => {
      const source = new File([new Uint8Array(fixture.bytes)], fixture.name, {type: fixture.name.endsWith("png") ? "image/png" : "image/jpeg"});
      const original = await createImageBitmap(source);
      const output = await removeClothingBackground(source);
      const bitmap = await createImageBitmap(output);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, opaque = 0, lightForeground = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 8) transparent++;
        if (pixels[i + 3] > 240) { opaque++; if (pixels[i] > 170 && pixels[i + 1] > 170 && pixels[i + 2] > 140) lightForeground++; }
      }
      const total = canvas.width * canvas.height;
      const result = {source: fixture.name, name: output.name, type: output.type, bytes: output.size, width: bitmap.width, height: bitmap.height, originalWidth: original.width, originalHeight: original.height, transparent: transparent / total, opaque: opaque / total, lightForeground: lightForeground / total, image: [...new Uint8Array(await output.arrayBuffer())]};
      original.close(); bitmap.close();
      return result;
    }));
  }, fixtures);
  for (const result of results) {
    await writeFile(path.join(root, ".sites-runtime", "processed-" + result.name), new Uint8Array(result.image));
    delete result.image;
    console.log(JSON.stringify(result));
    assert.equal(result.type, "image/png");
    assert.ok(result.name.endsWith(".png"));
    assert.ok(result.bytes > 0 && result.bytes <= 8 * 1024 * 1024);
    assert.ok(result.transparent > 0.05, `${result.source}: background is not transparent`);
    assert.ok(result.opaque > 0.05, `${result.source}: garment disappeared`);
    assert.ok(Math.max(result.width, result.height) <= 1600);
    assert.ok(result.width < result.originalWidth || result.height < result.originalHeight, `${result.source}: empty margins were not cropped`);
    if (result.source === "cream-tshirt.jpg") assert.ok(result.lightForeground > 0.05, "White garment was lost");
  }
  console.log("Photo processing tests passed (JPEG, PNG, transparency, crop, white clothing, recovery after invalid image and failed model loading).");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
