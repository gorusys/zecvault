import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command, mode }) => {
  const isDesktopBuild = process.env.ZEC_DESKTOP_BUILD === "1";
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadEnv(mode, __dirname, "VITE_"))) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    envDir: __dirname,
    server: { port: 5173, strictPort: true, host: true },
    define: envDefine,
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      ...(command === "build" && !isDesktopBuild
        ? [
            /** Keep miniflare / wrangler dev state out of `dist/server` so Vite can `emptyDir` (Windows EPERM on .sqlite) */
            cloudflare({
              viteEnvironment: { name: "ssr" },
              persistState: { path: path.join(__dirname, "node_modules", ".cache", "cf-vite-persist") },
            }),
          ]
        : []),
      tanstackStart(
        isDesktopBuild
          ? {
              prerender: {
                // Desktop builds package static client assets for Tauri and don't require prerendering.
                enabled: false,
              },
            }
          : undefined
      ),
      react(),
    ],
  };
});
