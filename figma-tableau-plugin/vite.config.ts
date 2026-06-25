import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Vite is used ONLY for `npm run dev` (browser preview with the devMock sandbox).
// The production single-file UI is built by scripts/build-ui.mjs with esbuild,
// which emits a classic IIFE inline <script> — the only shape that runs in
// Figma desktop's `file:`-origin plugin UI iframe (inline ES modules are blocked
// there). Do not build the UI with `vite build`.
export default defineConfig({
  root: resolve(__dirname, "src/ui"),
  plugins: [react()],
});
