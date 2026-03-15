import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: [
      "node_modules/**",
      "dist/**",
      ".next/**",
      "_scratch/**",
      "e2e/**",
      "src/lib/sceneArtWorker.node.test.ts",
      "app/play/__tests__/client.test.tsx",
    ],
  },
  resolve: {
    alias: [
      { find: /^@\/lib\/(.*)/, replacement: path.resolve(__dirname, "src/lib/$1") },
      { find: /^@\/generated\/(.*)/, replacement: path.resolve(__dirname, "src/generated/$1") },
      { find: /^@\/components\/(.*)/, replacement: path.resolve(__dirname, "components/$1") },
      { find: /^@\/app\/(.*)/, replacement: path.resolve(__dirname, "app/$1") },
      { find: /^@\/engine\/(.*)/, replacement: path.resolve(__dirname, "src/engine/$1") },
      { find: /^@\/server\/(.*)/, replacement: path.resolve(__dirname, "src/server/$1") },
      { find: /^@\/src\/(.*)/, replacement: path.resolve(__dirname, "src/$1") },
      { find: "~", replacement: path.resolve(__dirname, "src") },
    ],
  },
});
