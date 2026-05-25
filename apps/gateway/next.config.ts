import type { NextConfig } from "next"

const config: NextConfig = {
  transpilePackages: ["@repo/ui", "@repo/dal", "@repo/database"],
}

export default config
