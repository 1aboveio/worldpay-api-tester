/**
 * Dashboard page render tests
 *
 * Tests page components return correct structure with mocked sessions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetSession = vi.fn()
const mockGetMerchantStats = vi.fn()
const mockListMerchants = vi.fn()

vi.mock("@/lib/auth-server", () => ({
  getSession: (...args: any[]) => mockGetSession(...args),
}))

vi.mock("@/dal/portal", () => ({
  getMerchantStats: (...args: any[]) => mockGetMerchantStats(...args),
  listMerchants: (...args: any[]) => mockListMerchants(...args),
}))

function makeAdminSession() {
  return {
    user: { id: "u1", email: "admin@fmmpay.com", name: "Admin" },
    activeRole: "platform_admin" as const,
    activeMerchantId: null,
    availableMerchants: [
      { merchantId: "m1", merchantName: "Merchant 1", role: "platform_admin" },
      { merchantId: "m2", merchantName: "Merchant 2", role: "platform_admin" },
    ],
    isPlatformAdmin: true,
  }
}

function makeMerchantSession() {
  return {
    user: { id: "u2", email: "merchant@shop.com", name: "Merchant" },
    activeRole: "merchant" as const,
    activeMerchantId: "m1",
    availableMerchants: [{ merchantId: "m1", merchantName: "My Shop", role: "merchant" }],
    isPlatformAdmin: false,
  }
}

describe("PortalDashboardPage", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("renders platform admin dashboard with correct stats", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockGetMerchantStats.mockResolvedValue({
      merchantCount: 5, paymentsToday: 12, totalPayments: 150, successRate: 98, totalRefunds: 3,
    })

    const { default: PortalDashboardPage } = await import("@/app/(portal)/dashboard/page")
    const element = await PortalDashboardPage()
    expect(element).not.toBeNull()
    // Verify getMerchantStats was called with null (all merchants)
    expect(mockGetMerchantStats).toHaveBeenCalledWith(null)
  })

  it("renders merchant dashboard scoped to active merchant", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession())
    mockGetMerchantStats.mockResolvedValue({
      merchantCount: 1, paymentsToday: 3, totalPayments: 45, successRate: 95, totalRefunds: 1,
    })

    const { default: PortalDashboardPage } = await import("@/app/(portal)/dashboard/page")
    const element = await PortalDashboardPage()
    expect(element).not.toBeNull()
    expect(mockGetMerchantStats).toHaveBeenCalledWith("m1")
  })

  it("returns null when no session", async () => {
    mockGetSession.mockResolvedValue(null)
    const { default: PortalDashboardPage } = await import("@/app/(portal)/dashboard/page")
    const element = await PortalDashboardPage()
    expect(element).toBeNull()
  })

  it("calls getSession on each render", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockGetMerchantStats.mockResolvedValue({ merchantCount: 1, paymentsToday: 0, totalPayments: 10, successRate: 100, totalRefunds: 0 })
    const { default: PortalDashboardPage } = await import("@/app/(portal)/dashboard/page")
    await PortalDashboardPage()
    expect(mockGetSession).toHaveBeenCalledTimes(1)
  })
})

describe("Dashboard data flow", () => {
  it("platform admin sees aggregate stats across all merchants", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockGetMerchantStats.mockResolvedValue({ merchantCount: 10, paymentsToday: 50, totalPayments: 500, successRate: 97, totalRefunds: 20 })

    const { default: PortalDashboardPage } = await import("@/app/(portal)/dashboard/page")
    const element = await PortalDashboardPage()
    expect(element).not.toBeNull()
    // Platform admin passes null (no scoping)
    expect(mockGetMerchantStats).toHaveBeenCalledWith(null)
  })

  it("merchant sees only own stats", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession())
    mockGetMerchantStats.mockResolvedValue({ merchantCount: 1, paymentsToday: 5, totalPayments: 30, successRate: 96, totalRefunds: 2 })

    const { default: PortalDashboardPage } = await import("@/app/(portal)/dashboard/page")
    const element = await PortalDashboardPage()
    expect(element).not.toBeNull()
    // Merchant passes their merchantId
    expect(mockGetMerchantStats).toHaveBeenCalledWith("m1")
  })
})
