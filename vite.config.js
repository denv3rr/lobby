import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  const baseFromEnv = process.env.VITE_BASE_PATH;
  const base = command === "serve" ? "/" : (baseFromEnv || "/lobby/");

  return {
    base,
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/three/examples/jsm/loaders/GLTFLoader")) {
              return "three-gltf";
            }
            if (id.includes("node_modules/three")) {
              return "three-core";
            }
            if (/[\\/]src[\\/]systems[\\/]catalog[\\/]/.test(id)) {
              return "catalog";
            }
            if (/[\\/]src[\\/]systems[\\/]theming[\\/]atmosphere\.js$/.test(id)) {
              return "atmosphere";
            }
            if (/[\\/]src[\\/]systems[\\/]audio[\\/]/.test(id)) {
              return "audio";
            }
          }
        }
      }
    }
  };
});
