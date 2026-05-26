import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@repo/dal": path.resolve(__dirname, "../../packages/dal/src"),
      "@repo/database": path.resolve(__dirname, "./src/__mocks__/database.ts"),
      "server-only": path.resolve(__dirname, "./src/__mocks__/server-only.ts"),
    },
  },
})
