import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  const baseFromEnv = process.env.VITE_BASE_PATH;
  const base = command === "serve" ? "/" : (baseFromEnv || "/lobby/");

  return {
    base
  };
});
