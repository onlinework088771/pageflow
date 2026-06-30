import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

// Load Replit-only dev plugins without leaking their import specifiers as
// string literals. Rollup statically resolves string-literal dynamic imports,
// which breaks Docker/VPS builds because the @replit/* packages depend on
// Replit-internal APIs. Using a template literal with a variable makes the
// specifier non-static, so Rollup skips resolution entirely. The imports still
// execute correctly at runtime inside Replit because the variable evaluates to
// the correct package name.
const replitPlugins: any[] = [];
if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
  const pkg = "@replit";
  const { default: runtimeErrorModal } = await import(`${pkg}/vite-plugin-runtime-error-modal`);
  replitPlugins.push(runtimeErrorModal());
  const { cartographer } = await import(`${pkg}/vite-plugin-cartographer`);
  replitPlugins.push(cartographer({ root: path.resolve(import.meta.dirname, "..") }));
  const { devBanner } = await import(`${pkg}/vite-plugin-dev-banner`);
  replitPlugins.push(devBanner());
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...replitPlugins,
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    ...(process.env.REPL_ID
      ? {}
      : {
          proxy: {
            "/api": {
              target: `http://localhost:${process.env.API_PORT ?? 8080}`,
              changeOrigin: true,
            },
            "/uploads": {
              target: `http://localhost:${process.env.API_PORT ?? 8080}`,
              changeOrigin: true,
            },
          },
        }),
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
