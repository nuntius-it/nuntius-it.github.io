import { defineConfig } from "vite";

// Percorsi relativi: la UI è caricata da Electron con loadFile (file://),
// dove i percorsi assoluti "/..." non funzionano.
export default defineConfig({
  base: "./",
});
