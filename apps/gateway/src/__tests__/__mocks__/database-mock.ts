/**
 * Mock @repo/database for integration tests.
 * Provides a minimal PrismaClient-like interface for auth lookups.
 */

// Minimal ApiKey store for auth lookups
const apiKeys = new Map<
  string,
  { id: string; key: string; merchantId: string }
>();

export const database = {
  apiKey: {
    findUnique: async (args: {
      where: { key: string };
      select: { merchantId: boolean };
    }) => {
      const record = apiKeys.get(args.where.key);
      return record ? { merchantId: record.merchantId } : null;
    },
  },
};

// Seed known test keys
apiKeys.set("sk_test_valid", {
  id: "ak_1",
  key: "sk_test_valid",
  merchantId: "merchant_1",
});
apiKeys.set("sk_test_merchant2", {
  id: "ak_2",
  key: "sk_test_merchant2",
  merchantId: "merchant_2",
});

// Provide a stub for re-exported types
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Prisma {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface PaymentMethodGetPayload<T = {}> {
    id: string;
    merchantId: string;
    worldpayTokenHref: string;
    brand: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
    funding: string;
    country: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }
}
