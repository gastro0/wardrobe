import {createRequire} from "node:module";

// Reuse the project's bundler to load TypeScript and its local imports in Node.
const runtimeRequire = createRequire(new URL("../node_modules/wrangler/package.json", import.meta.url));
const {build} = runtimeRequire("esbuild");

export async function importTestModule(file) {
  const result = await build({entryPoints: [file], bundle: true, write: false, platform: "node", format: "esm", target: "node22", logLevel: "silent"});
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
}
