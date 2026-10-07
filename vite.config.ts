import { defineConfig } from "vite";
export default defineConfig({
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  build: { target: "esnext" },   // prefs.ts loads the saved file with top-level await
});
