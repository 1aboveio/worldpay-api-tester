import { config } from "dotenv"

// Load .env from repo root (relative to packages/database)
config({ path: new URL("../../.env", import.meta.url).pathname })

import { defineConfig, env } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
