/**
 * Vite/Cloudflare emits `dist/server/wrangler.json` with configPath / userConfigPath
 * set to the build machine's absolute paths. Those do not exist on end-user PCs and
 * can break `wrangler dev` when the desktop app runs from bundled `worker/server`.
 * Strip those keys; the file already contains the resolved worker config in-tree.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "../dist/server/wrangler.json");

if (!existsSync(out)) {
  console.warn("sanitize-wrangler-config: skip (no dist/server/wrangler.json; run vite build first)");
  process.exit(0);
}

const json = JSON.parse(readFileSync(out, "utf8"));
delete json.configPath;
delete json.userConfigPath;
writeFileSync(out, JSON.stringify(json));
