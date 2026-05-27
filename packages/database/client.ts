import { PrismaClient } from "./generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const connectionString = process.env.DATABASE_URL!

// SSL is opt-in via DATABASE_SSL, because the right answer differs per environment:
//
//  - Cloud SQL over TCP (private/public IP) REQUIRES SSL — without it the server
//    rejects the connection with `pg_hba.conf ... no encryption`. Its CA cert isn't
//    in the system trust store, so we encrypt without verifying the chain
//    (rejectUnauthorized:false). To verify instead, supply server-ca.pem as ssl.ca.
//  - Plain Postgres (CI, local dev, test containers) does NOT offer SSL; forcing it
//    fails with "server does not support SSL connections" and every query 500s.
//
// So set DATABASE_SSL=require (or true) only for Cloud-SQL-over-TCP connections;
// leave it unset everywhere else. We use our own ssl object rather than the URL's
// `sslmode` because pg's sslmode semantics are changing across versions (require is
// currently treated as verify-full, which rejects Cloud SQL's untrusted CA).
//
// Cloud Run reaches the DB over a local unix socket (host=/cloudsql/...); that path
// is already encrypted by the Cloud SQL proxy and must never use SSL.
const isUnixSocket = connectionString.includes("host=/") || /@\/[^/]/.test(connectionString)
const sslEnv = (process.env.DATABASE_SSL ?? "").trim().toLowerCase()
const useSsl = !isUnixSocket && sslEnv !== "" && !["false", "0", "disable", "off", "no"].includes(sslEnv)

const adapter = new PrismaPg({
  connectionString,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
})

const globalForPrisma = globalThis as unknown as { database?: PrismaClient }

export const database =
  globalForPrisma.database ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.database = database
}
