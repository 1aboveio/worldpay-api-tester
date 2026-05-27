import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/__mocks__/**",
        "src/**/*.test.*",
        "src/**/*.spec.*",
        "src/**/smoke/**",
        "src/test-setup.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 55,
        lines: 60,
      },
    },
  },
  esbuild: {
    jsx: "automatic",
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
