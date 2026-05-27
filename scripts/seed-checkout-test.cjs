/**
 * One-off local seed for testing the checkout playground against the Worldpay
 * sandbox. Creates (idempotently): the CheckoutSession table if missing, a
 * PLACEHOLDER merchant, and an open checkout session. Prints the checkout URL.
 *
 * The merchant entity is a placeholder, so tokenization (which only needs the
 * Worldpay credentials) should succeed while the authorize step will be refused
 * by Worldpay — which is exactly the point of this smoke test.
 *
 * Run:  DATABASE_URL='postgresql://...' node scripts/seed-checkout-test.cjs
 */
const path = require("path")

let Client
try {
  ;({ Client } = require("pg"))
} catch {
  ;({ Client } = require(path.resolve(__dirname, "../node_modules/.pnpm/pg@8.21.0/node_modules/pg")))
}

const MERCHANT_ID = "mer_playground"
const ENTITY = process.env.SEED_ENTITY || "gfhk001"
const PAYFAC = JSON.stringify({
  schemeId: process.env.SEED_SCHEME_ID || "12345",
  subMerchant: {
    reference: "PGSUB001",
    name: "Playground Sub Merchant",
    address: { street: "1 Test Street", postalCode: "EC1A 1BB", city: "London", countryCode: "GB" },
  },
})
const CS_ID = "cs_playgroundtest"
const AMOUNT = 4200
const CURRENCY = "USD"

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is required")

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
  await client.connect()

  // Create the CheckoutSession table if it doesn't exist (matches the Prisma model).
  await client.query(`
    CREATE TABLE IF NOT EXISTS "CheckoutSession" (
      "id" TEXT PRIMARY KEY,
      "merchantId" TEXT NOT NULL,
      "amount" INTEGER NOT NULL,
      "currency" TEXT NOT NULL,
      "captureMethod" TEXT NOT NULL DEFAULT 'automatic',
      "description" TEXT,
      "status" TEXT NOT NULL DEFAULT 'open',
      "paymentIntentId" TEXT,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Merchant (PayFac).
  await client.query(
    `INSERT INTO "Merchant" ("id","name","entity","payFacConfig","status","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4::jsonb,'active',NOW(),NOW())
     ON CONFLICT ("id") DO UPDATE SET "entity" = EXCLUDED."entity", "payFacConfig" = EXCLUDED."payFacConfig"`,
    [MERCHANT_ID, "Playground Test Merchant", ENTITY, PAYFAC],
  )

  // Open checkout session (reset to open + future expiry on re-run).
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await client.query(
    `INSERT INTO "CheckoutSession" ("id","merchantId","amount","currency","captureMethod","description","status","expiresAt","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,'automatic',$5,'open',$6,NOW(),NOW())
     ON CONFLICT ("id") DO UPDATE SET "status" = 'open', "paymentIntentId" = NULL, "expiresAt" = EXCLUDED."expiresAt"`,
    [CS_ID, MERCHANT_ID, AMOUNT, CURRENCY, "Playground test order", expires],
  )

  await client.end()
  console.log(`SEEDED merchant=${MERCHANT_ID} entity=${ENTITY}`)
  console.log(`CHECKOUT_URL=http://localhost:3000/checkout/${CS_ID}`)
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message)
  process.exit(1)
})
