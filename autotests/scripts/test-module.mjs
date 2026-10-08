import {build} from "esbuild";
import {projectRoot} from "../project.mjs";

export async function importTestModule(file) {
  const result = await build({absWorkingDir: projectRoot, entryPoints: [file], bundle: true, write: false, platform: "node", format: "esm", target: "node22", logLevel: "silent"});
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
}
