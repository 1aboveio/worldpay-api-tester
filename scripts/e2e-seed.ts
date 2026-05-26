import { PrismaClient } from "@repo/database";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: "postgres://worldpay:worldpay@localhost:5433/worldpay",
  }),
});

async function seed() {
  await db.merchant.upsert({
    where: { id: "m_test" },
    create: {
      id: "m_test",
      name: "Test Merchant",
      entity: "test_entity",
      payFacConfig: {
        schemeId: "12345",
        subMerchant: {
          reference: "sub001",
          name: "Test Sub",
          address: {
            line1: "123 St",
            city: "Test",
            postalCode: "12345",
            country: "GB",
          },
        },
      },
    },
    update: {},
  });

  const hash = createHash("sha256").update("sk_test_e2e").digest("hex");
  await db.apiKey.upsert({
    where: { id: "ak_test" },
    create: {
      id: "ak_test",
      keyHash: hash,
      prefix: "sk_test_",
      merchantId: "m_test",
    },
    update: {},
  });

  console.log("Seeded");
  await db.$disconnect();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
