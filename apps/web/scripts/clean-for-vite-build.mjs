/**
 * The SSR `emptyDir` step can fail (EPERM on Windows) if a prior run left
 * `dist/server/.wrangler` with miniflare cache SQLite open. The Cloudflare Vite
 * `persistState` option keeps new state out of `dist` — this only clears any
 * leftover `dist/server/.wrangler` from before that or from standalone
 * `wrangler dev` against the build output.
 */
import { existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const nestedWrangler = join(__dirname, "../dist/server/.wrangler");

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function tryRemove() {
  if (!existsSync(nestedWrangler)) {
    return;
  }

  if (process.platform === "win32") {
    for (let i = 0; i < 8; i++) {
      try {
        // Often succeeds for locked tree when `rmSync` does not
        execFileSync("cmd.exe", ["/c", "rmdir", "/s", "/q", nestedWrangler], {
          stdio: "ignore",
          windowsHide: true,
        });
        if (!existsSync(nestedWrangler)) {
          return;
        }
      } catch {
        // retry
      }
      sleepSync(200 + i * 75);
    }
  }

  for (let i = 0; i < 10; i++) {
    try {
      rmSync(nestedWrangler, { recursive: true, force: true });
      if (!existsSync(nestedWrangler)) {
        return;
      }
    } catch (e) {
      if (i === 9) {
        const err = /** @type {NodeJS.ErrnoException} */ (e);
        throw new Error(
          `Could not remove ${nestedWrangler} (${err.code}): if wrangler or another ` +
            `Node process is still running, stop it and build again.`
        );
      }
      sleepSync(200 + i * 75);
    }
  }
}

tryRemove();
