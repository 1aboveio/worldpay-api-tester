import { vi } from "vitest";

// Mock worldpay client singleton
vi.mock("@/lib/worldpay", () => ({
  getWorldpayClient: vi.fn(),
  setWorldpayClient: vi.fn(),
}));

// Re-export prisma from dal so tests can configure it
export { prisma } from "@payfac/dal";
