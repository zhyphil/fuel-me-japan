import { defineConfig } from "vitest/config";
export default defineConfig({
  build: { manifest: true },
  // Match the existing Cloudflare Pages rewrite when previewing detail URLs.
  // Otherwise Vite serves the home shell and preloads FindFuel on rental pages.
  plugins: [{
    name: "rental-preview-shell",
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        // Keep Vite's rejection of invalid URI encodings before any rewrite.
        try { decodeURI(request.url ?? ""); } catch { next(); return; }
        const match = request.url?.match(/^\/(en|zh-Hant|ko|zh-Hans|th)\/return-car\/[^?]+(\?.*)?$/);
        if (match) request.url = `/${match[1]}/return-car/${match[2] ?? ""}`;
        next();
      });
    },
  }],
  test: { include: ["tests/unit/**/*.test.ts"] },
});
