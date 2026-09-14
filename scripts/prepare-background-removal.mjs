import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const assetVersion = "1.7.0";
const resourceKeys = [
  "/models/isnet_quint8",
  "/onnxruntime-web/ort-wasm-simd-threaded.wasm",
  "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
];
const assetRoot = path.join(projectRoot, "public/background-removal", assetVersion);
const sourceRoot = `https://staticimgly.com/@imgly/background-removal-data/${assetVersion}/dist/`;

export async function prepareBackgroundRemoval() {
  await mkdir(assetRoot, { recursive: true });
  const manifestPath = path.join(assetRoot, "resources.json");
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log("Downloading background removal resources...");
    const response = await fetch(new URL("resources.json", sourceRoot), {signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`Background removal manifest: HTTP ${response.status}`);
    const complete = await response.json();
    manifest = Object.fromEntries(resourceKeys.map(key => [key, complete[key]]));
  }
  for (const key of resourceKeys) {
    const entry = manifest[key];
    if (!entry || !Array.isArray(entry.chunks)) throw new Error(`Missing photo processing resource: ${key}`);
    for (const chunk of entry.chunks) {
      if (!/^[a-f0-9]{64}$/.test(chunk.name) || chunk.name !== chunk.hash) throw new Error("Invalid resource filename");
      const target = path.join(assetRoot, chunk.name);
      const expectedSize = chunk.offsets[1] - chunk.offsets[0];
      const valid = bytes => bytes.length === expectedSize && createHash("sha256").update(bytes).digest("hex") === chunk.hash;
      try {
        if (valid(await readFile(target))) continue;
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      console.log(`Downloading ${key} (${chunk.offsets[1]} / ${entry.size})...`);
      const response = await fetch(new URL(chunk.name, sourceRoot), {signal: AbortSignal.timeout(60000)});
      if (!response.ok) throw new Error(`Background removal data: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!valid(bytes)) throw new Error(`Invalid background removal data: ${chunk.name}`);
      await writeFile(target, bytes);
    }
  }
  await writeFile(manifestPath, JSON.stringify(manifest));
  await writeFile(path.join(assetRoot, "LICENSE.md"), await readFile(path.join(projectRoot, "node_modules/@imgly/background-removal/LICENSE.md")));
  await writeFile(path.join(assetRoot, "ThirdPartyLicenses.json"), await readFile(path.join(projectRoot, "node_modules/@imgly/background-removal/ThirdPartyLicenses.json")));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareBackgroundRemoval();
}
