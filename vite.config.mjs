import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [
    react(),
    {
      name: "reload-screen-materials",
      apply: "serve",
      handleHotUpdate(context) {
        if (!context.file.endsWith("/src/iphone-duo/screen-material.ts")) return;
        // React refresh can keep an already-created Three material alive.
        // Rebuild the WebGL scene whenever shader source/uniforms change.
        for (const module of context.modules) context.server.moduleGraph.invalidateModule(module);
        context.server.ws.send({ type: "full-reload" });
        return [];
      },
    },
  ],
});
