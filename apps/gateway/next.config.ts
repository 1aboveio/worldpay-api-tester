import type { NextConfig } from "next"

const config: NextConfig = {
  transpilePackages: ["@repo/dal", "@repo/database"],
}

export default config
