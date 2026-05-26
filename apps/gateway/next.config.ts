import type { NextConfig } from "next"

const config: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@repo/dal",
    "@repo/database",
    "@repo/ui",
    "@repo/typescript-config",
    "@payfac/gateway-core",
    "@payfac/worldpay-client",
    "@payfac/validators",
    "better-auth",
    "@better-auth/prisma-adapter",
  ],
}

export default config
