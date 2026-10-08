import path from "node:path";
import {fileURLToPath} from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const testRoot = fileURLToPath(new URL("./", import.meta.url));

// Resolve application sources independently of the test runner's working directory.
export function projectPath(...segments) {
  return path.join(projectRoot, ...segments);
}
