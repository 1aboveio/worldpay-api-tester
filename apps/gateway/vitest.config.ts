/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@repo/dal": path.resolve(__dirname, "./src/__tests__/__mocks__/dal-mock.ts"),
      "@repo/database": path.resolve(
        __dirname,
        "./src/__tests__/__mocks__/database-mock.ts",
      ),
    },
  },
});
