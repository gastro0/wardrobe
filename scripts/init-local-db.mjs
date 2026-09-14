import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { projectRoot } from "./sites-env.mjs";

const buildConfigPath = path.join(projectRoot, "dist/server/wrangler.json");
let buildConfig;
try {
  buildConfig = JSON.parse(readFileSync(buildConfigPath, "utf8"));
} catch (error) {
  if (error.code === "ENOENT") {
    console.error("Run npm run build before initializing the local database.");
    process.exit(1);
  }
  throw error;
}

const runtimeRoot = path.join(projectRoot, ".sites-runtime");
mkdirSync(runtimeRoot, { recursive: true });
const configPath = path.join(runtimeRoot, "local-db.json");
writeFileSync(configPath, JSON.stringify({
  name: buildConfig.name,
  compatibility_date: buildConfig.compatibility_date,
  d1_databases: buildConfig.d1_databases.map(database => ({
    ...database,
    migrations_dir: path.join(projectRoot, "drizzle"),
  })),
}, null, 2));

for (const database of buildConfig.d1_databases) {
  const result = spawnSync(process.execPath, [
    path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js"),
    "d1", "migrations", "apply", database.binding,
    "--config", configPath, "--local",
    "--persist-to", path.join(projectRoot, ".wrangler/state"),
  ], { stdio: "inherit", env: { ...process.env, CI: "true" } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
