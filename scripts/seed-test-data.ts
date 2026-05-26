import { config } from "dotenv"
config({ path: new URL("../../.env", import.meta.url).pathname })

import { database } from "@repo/database"

async function seed() {
  // Clean existing data
  await database.apiKey.deleteMany()
  await database.merchant.deleteMany()

  // Create test merchant
  await database.merchant.create({
    data: {
      id: "mer_001",
      name: "Test Merchant",
      apiKey: "unused",
      worldpayEntity: "gfhk001",
      payfacSchemeId: "12345",
      status: "active",
    },
  })

  // Create test API key (hash of 'sk_test_valid_key_12345678901234567890')
  await database.apiKey.create({
    data: {
      id: "ak_001",
      merchantId: "mer_001",
      keyHash: "c8e8e8f4a5b5d6d7e8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
      scopes: "read,write",
    },
  })

  console.log("Seed complete")
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
