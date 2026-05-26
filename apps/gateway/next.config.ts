import type { NextConfig } from "next"

const config: NextConfig = {
  output: "standalone",
  transpilePackages: ["@repo/dal", "@repo/database"],
}

export default config
