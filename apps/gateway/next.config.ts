import type { NextConfig } from "next"

const config: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: [
    "@repo/dal",
    "@repo/database",
    "@repo/ui",
    "@payfac/gateway-core",
    "@payfac/worldpay-client",
    "@payfac/validators",
    "better-auth",
    "better-auth/next-js",
    "@better-auth/prisma-adapter",
    "sonner",
  ],
  turbopack: {},
}

export default config
