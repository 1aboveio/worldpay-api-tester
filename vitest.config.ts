import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@payfac/dal": path.resolve(__dirname, "packages/dal/src"),
      "@payfac/worldpay-client": path.resolve(
        __dirname,
        "packages/worldpay-client/src"
      ),
      "@payfac/worldpay-client/client": path.resolve(
        __dirname,
        "packages/worldpay-client/src/client"
      ),
      "@payfac/validators": path.resolve(__dirname, "packages/validators/src"),
      "@payfac/gateway-core": path.resolve(
        __dirname,
        "packages/gateway-core/src"
      ),
      "@": path.resolve(__dirname, "apps/gateway/src"),
    },
  },
});
