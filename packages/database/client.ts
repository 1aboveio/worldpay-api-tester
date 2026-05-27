import { PrismaClient } from "./generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const connectionString = process.env.DATABASE_URL!

// Cloud SQL requires SSL for TCP connections (private/public IP). psql negotiates
// TLS automatically, but node-postgres does not — without this the server rejects
// the connection with `pg_hba.conf ... no encryption`. Cloud SQL serves an
// instance-specific CA cert that isn't in the system trust store, so we encrypt
// without verifying the chain (rejectUnauthorized:false). To verify instead, pass
// the instance's server-ca.pem as ssl.ca.
//
// Cloud Run reaches the DB over a local unix socket (host=/cloudsql/...); that path
// is already encrypted by the Cloud SQL proxy and must NOT use SSL.
const isUnixSocket = connectionString.includes("host=/") || /@\/[^/]/.test(connectionString)

const adapter = new PrismaPg({
  connectionString,
  ...(isUnixSocket ? {} : { ssl: { rejectUnauthorized: false } }),
})

const globalForPrisma = globalThis as unknown as { database?: PrismaClient }

export const database =
  globalForPrisma.database ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.database = database
}
