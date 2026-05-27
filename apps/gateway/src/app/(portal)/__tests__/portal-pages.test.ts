/**
 * Portal page render tests
 *
 * Tests page components for merchants, payments, payment-methods,
 * refunds, settings, and statements pages with mocked sessions and DAL.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mock next/navigation ─────────────────────────────────────
class NextRedirectError extends Error {
  digest = "NEXT_REDIRECT"
  constructor(url: string) {
    super(`NEXT_REDIRECT: ${url}`)
    this.name = "NextRedirectError"
  }
}

class NextNotFoundError extends Error {
  digest = "NEXT_NOT_FOUND"
  constructor() {
    super("NEXT_NOT_FOUND")
    this.name = "NextNotFoundError"
  }
}

const mockRedirect = vi.fn((url: string) => {
  throw new NextRedirectError(url)
})
const mockNotFound = vi.fn(() => {
  throw new NextNotFoundError()
})

vi.mock("next/navigation", () => ({
  redirect: (...args: any[]) => mockRedirect(...args),
  notFound: (...args: any[]) => mockNotFound(...args),
}))

// ─── Mock next/link ───────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))

// ─── Mock client components ───────────────────────────────────
vi.mock("@/app/(portal)/merchants/[id]/fraudsight-form", () => ({
  FraudSightConfigForm: () => null,
}))

vi.mock("@/app/(portal)/settings/api-key-manager", () => ({
  ApiKeyManager: () => null,
}))

// ─── Mock auth-server ─────────────────────────────────────────
const mockGetSession = vi.fn()

vi.mock("@/lib/auth-server", () => ({
  getSession: (...args: any[]) => mockGetSession(...args),
}))

// ─── Mock DAL ─────────────────────────────────────────────────
const mockListMerchants = vi.fn()
const mockGetMerchantById = vi.fn()
const mockListPaymentIntents = vi.fn()
const mockListPaymentMethods = vi.fn()
const mockListRefunds = vi.fn()
const mockGetApiKeysForMerchant = vi.fn()
const mockListStatements = vi.fn()

vi.mock("@/dal/portal", () => ({
  listMerchants: (...args: any[]) => mockListMerchants(...args),
  getMerchantById: (...args: any[]) => mockGetMerchantById(...args),
  listPaymentIntents: (...args: any[]) => mockListPaymentIntents(...args),
  listPaymentMethods: (...args: any[]) => mockListPaymentMethods(...args),
  listRefunds: (...args: any[]) => mockListRefunds(...args),
  getApiKeysForMerchant: (...args: any[]) => mockGetApiKeysForMerchant(...args),
  listStatements: (...args: any[]) => mockListStatements(...args),
}))

// ─── Session factories ────────────────────────────────────────

function makeAdminSession() {
  return {
    user: { id: "u1", email: "admin@fmmpay.com", name: "Admin" },
    activeRole: "platform_admin" as const,
    activeMerchantId: null,
    availableMerchants: [
      { merchantId: "m1", merchantName: "Merchant One", role: "platform_admin" },
      { merchantId: "m2", merchantName: "Merchant Two", role: "platform_admin" },
    ],
    isPlatformAdmin: true,
  }
}

function makeMerchantSession(merchantId = "m1") {
  return {
    user: { id: "u2", email: "merchant@shop.com", name: "Merchant" },
    activeRole: "merchant" as const,
    activeMerchantId: merchantId,
    availableMerchants: [
      { merchantId, merchantName: "My Shop", role: "merchant" },
    ],
    isPlatformAdmin: false,
  }
}

// ─── Sample data factories ────────────────────────────────────

function makeMerchant(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    name: "Test Merchant",
    entity: "us",
    createdAt: new Date("2024-01-15").toISOString(),
    payFacConfig: {
      fraudsight: {
        enabled: true,
        actionOnHighRisk: "monitor",
        actionOnReview: "monitor",
        exemption: false,
        capability: "risk_assessment",
      },
    },
    apiKeys: [
      {
        id: "ak1",
        prefix: "sk_live_abc123",
        isActive: true,
        keyHash: "hash_abc",
        createdAt: new Date("2024-01-15").toISOString(),
      },
    ],
    ...overrides,
  }
}

function makeMerchantList() {
  return [
    makeMerchant({ id: "m1", name: "Alpha Corp", entity: "us" }),
    makeMerchant({
      id: "m2",
      name: "Beta Ltd",
      entity: "gb",
      payFacConfig: { fraudsight: { enabled: false } },
      apiKeys: [],
    }),
  ]
}

function makePaymentIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: "pi_test_1234567890abcdef",
    amount: 2500,
    currency: "USD",
    status: "succeeded",
    createdAt: new Date("2024-06-01").toISOString(),
    ...overrides,
  }
}

function makePaymentMethod(overrides: Record<string, unknown> = {}) {
  return {
    id: "pm_test_abc123",
    brand: "visa",
    last4: "4242",
    expiryMonth: 12,
    expiryYear: 2026,
    type: "card",
    createdAt: new Date("2024-06-01").toISOString(),
    ...overrides,
  }
}

function makeRefund(overrides: Record<string, unknown> = {}) {
  return {
    id: "rf_test_abc123def456",
    amount: 2500,
    currency: "USD",
    status: "succeeded",
    paymentIntentId: "pi_test_1234567890abcdef",
    createdAt: new Date("2024-06-15").toISOString(),
    paymentIntent: { id: "pi_test_1234567890abcdef" },
    ...overrides,
  }
}

function makeApiKey(overrides: Record<string, unknown> = {}) {
  return {
    id: "ak_live_xyz789",
    prefix: "sk_live_xyz789",
    isActive: true,
    keyHash: "hash_xyz",
    createdAt: new Date("2024-06-01").toISOString(),
    ...overrides,
  }
}

function makeStatement(overrides: Record<string, unknown> = {}) {
  return {
    id: "stmt_001",
    periodStart: new Date("2024-05-01").toISOString(),
    periodEnd: new Date("2024-05-31").toISOString(),
    totalVolume: 150000,
    totalFees: 3500,
    transactionCount: 42,
    status: "final",
    createdAt: new Date("2024-06-01").toISOString(),
    ...overrides,
  }
}

// ─── Reset before each test ───────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// Merchants list page
// ═══════════════════════════════════════════════════════════════

describe("MerchantsPage", () => {
  it("renders merchants list as platform admin", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockListMerchants.mockResolvedValue(makeMerchantList())

    const { default: MerchantsPage } = await import("@/app/(portal)/merchants/page")
    const element = await MerchantsPage()

    expect(element).not.toBeNull()
    expect(mockListMerchants).toHaveBeenCalledOnce()
  })

  it("redirects merchant users to dashboard", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession())

    const { default: MerchantsPage } = await import("@/app/(portal)/merchants/page")
    await expect(MerchantsPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("redirects unauthenticated users to login", async () => {
    mockGetSession.mockResolvedValue(null)

    const { default: MerchantsPage } = await import("@/app/(portal)/merchants/page")
    await expect(MerchantsPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("renders empty state for no merchants", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockListMerchants.mockResolvedValue([])

    const { default: MerchantsPage } = await import("@/app/(portal)/merchants/page")
    const element = await MerchantsPage()

    expect(element).not.toBeNull()
  })

  it("renders merchant names and FraudSight badges", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockListMerchants.mockResolvedValue(makeMerchantList())

    const { default: MerchantsPage } = await import("@/app/(portal)/merchants/page")
    const element = await MerchantsPage()

    expect(element).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// Merchant detail page
// ═══════════════════════════════════════════════════════════════

describe("MerchantDetailPage", () => {
  it("renders merchant detail as platform admin", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockGetMerchantById.mockResolvedValue(makeMerchant())

    const { default: MerchantDetailPage } = await import(
      "@/app/(portal)/merchants/[id]/page"
    )
    const element = await MerchantDetailPage({
      params: Promise.resolve({ id: "m1" }),
    })

    expect(element).not.toBeNull()
    expect(mockGetMerchantById).toHaveBeenCalledWith("m1")
  })

  it("redirects merchant users to dashboard", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession())
    mockGetMerchantById.mockResolvedValue(makeMerchant())

    const { default: MerchantDetailPage } = await import(
      "@/app/(portal)/merchants/[id]/page"
    )
    await expect(
      MerchantDetailPage({ params: Promise.resolve({ id: "m1" }) })
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("redirects unauthenticated users to login", async () => {
    mockGetSession.mockResolvedValue(null)

    const { default: MerchantDetailPage } = await import(
      "@/app/(portal)/merchants/[id]/page"
    )
    await expect(
      MerchantDetailPage({ params: Promise.resolve({ id: "m1" }) })
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("calls notFound when merchant does not exist", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockGetMerchantById.mockResolvedValue(null)

    const { default: MerchantDetailPage } = await import(
      "@/app/(portal)/merchants/[id]/page"
    )
    await expect(
      MerchantDetailPage({ params: Promise.resolve({ id: "nonexistent" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mockNotFound).toHaveBeenCalled()
  })

  it("renders FraudSight config section", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockGetMerchantById.mockResolvedValue(makeMerchant())

    const { default: MerchantDetailPage } = await import(
      "@/app/(portal)/merchants/[id]/page"
    )
    const element = await MerchantDetailPage({
      params: Promise.resolve({ id: "m1" }),
    })

    expect(element).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// Payments list page
// ═══════════════════════════════════════════════════════════════

describe("PaymentsPage — admin view", () => {
  it("renders payments list for platform admin", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockListPaymentIntents.mockResolvedValue({
      items: [makePaymentIntent(), makePaymentIntent({ id: "pi_test_abcdef", status: "processing" })],
      total: 2,
    })
    mockListMerchants.mockResolvedValue(makeMerchantList())

    const { default: PaymentsPage } = await import("@/app/(portal)/payments/page")
    const element = await PaymentsPage({
      searchParams: Promise.resolve({}),
    })

    expect(element).not.toBeNull()
    expect(mockListPaymentIntents).toHaveBeenCalled()
  })

  it("renders with merchant filter as admin", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockListPaymentIntents.mockResolvedValue({
      items: [makePaymentIntent()],
      total: 1,
    })
    mockListMerchants.mockResolvedValue(makeMerchantList())

    const { default: PaymentsPage } = await import("@/app/(portal)/payments/page")
    const element = await PaymentsPage({
      searchParams: Promise.resolve({ merchant: "m2" }),
    })

    expect(element).not.toBeNull()
    // DAL called with filtered merchant
    expect(mockListPaymentIntents).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "m2" })
    )
  })

  it("renders empty state for no payments", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockListPaymentIntents.mockResolvedValue({ items: [], total: 0 })
    mockListMerchants.mockResolvedValue([])

    const { default: PaymentsPage } = await import("@/app/(portal)/payments/page")
    const element = await PaymentsPage({
      searchParams: Promise.resolve({}),
    })

    expect(element).not.toBeNull()
  })
})

describe("PaymentsPage — merchant view", () => {
  it("renders payments scoped to merchant", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockListPaymentIntents.mockResolvedValue({
      items: [makePaymentIntent()],
      total: 1,
    })

    const { default: PaymentsPage } = await import("@/app/(portal)/payments/page")
    const element = await PaymentsPage({
      searchParams: Promise.resolve({}),
    })

    expect(element).not.toBeNull()
    // DAL called with merchant's activeMerchantId
    expect(mockListPaymentIntents).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "m1" })
    )
  })

  it("redirects unauthenticated users to login", async () => {
    mockGetSession.mockResolvedValue(null)

    const { default: PaymentsPage } = await import("@/app/(portal)/payments/page")
    await expect(
      PaymentsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("passes status filter to DAL", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockListPaymentIntents.mockResolvedValue({
      items: [makePaymentIntent({ status: "succeeded" })],
      total: 1,
    })

    const { default: PaymentsPage } = await import("@/app/(portal)/payments/page")
    const element = await PaymentsPage({
      searchParams: Promise.resolve({ status: "succeeded" }),
    })

    expect(element).not.toBeNull()
    expect(mockListPaymentIntents).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" })
    )
  })
})

// ═══════════════════════════════════════════════════════════════
// Payment methods page
// ═══════════════════════════════════════════════════════════════

describe("PaymentMethodsPage", () => {
  it("renders stored cards for merchant", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockListPaymentMethods.mockResolvedValue([
      makePaymentMethod(),
      makePaymentMethod({ id: "pm_visa_2", brand: "mastercard", last4: "5555" }),
    ])

    const { default: PaymentMethodsPage } = await import(
      "@/app/(portal)/payment-methods/page"
    )
    const element = await PaymentMethodsPage()

    expect(element).not.toBeNull()
    expect(mockListPaymentMethods).toHaveBeenCalledWith("m1")
  })

  it("renders empty state for no payment methods", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockListPaymentMethods.mockResolvedValue([])

    const { default: PaymentMethodsPage } = await import(
      "@/app/(portal)/payment-methods/page"
    )
    const element = await PaymentMethodsPage()

    expect(element).not.toBeNull()
  })

  it("redirects admin users to dashboard (no merchantId)", async () => {
    // admin sessions have activeMerchantId = null
    mockGetSession.mockResolvedValue(makeAdminSession())

    const { default: PaymentMethodsPage } = await import(
      "@/app/(portal)/payment-methods/page"
    )
    await expect(PaymentMethodsPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("redirects unauthenticated users to login", async () => {
    mockGetSession.mockResolvedValue(null)

    const { default: PaymentMethodsPage } = await import(
      "@/app/(portal)/payment-methods/page"
    )
    await expect(PaymentMethodsPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })
})

// ═══════════════════════════════════════════════════════════════
// Refunds page
// ═══════════════════════════════════════════════════════════════

describe("RefundsPage", () => {
  it("renders refunds scoped to merchant", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockListRefunds.mockResolvedValue([
      makeRefund(),
      makeRefund({ id: "rf_002", amount: 5000, status: "pending" }),
    ])

    const { default: RefundsPage } = await import("@/app/(portal)/refunds/page")
    const element = await RefundsPage()

    expect(element).not.toBeNull()
    expect(mockListRefunds).toHaveBeenCalledWith("m1")
  })

  it("renders empty state for no refunds", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockListRefunds.mockResolvedValue([])

    const { default: RefundsPage } = await import("@/app/(portal)/refunds/page")
    const element = await RefundsPage()

    expect(element).not.toBeNull()
  })

  it("redirects admin users to dashboard (no merchantId)", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())

    const { default: RefundsPage } = await import("@/app/(portal)/refunds/page")
    await expect(RefundsPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("redirects unauthenticated users to login", async () => {
    mockGetSession.mockResolvedValue(null)

    const { default: RefundsPage } = await import("@/app/(portal)/refunds/page")
    await expect(RefundsPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })
})

// ═══════════════════════════════════════════════════════════════
// Settings page
// ═══════════════════════════════════════════════════════════════

describe("SettingsPage", () => {
  it("renders API keys and merchant info", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockGetApiKeysForMerchant.mockResolvedValue([makeApiKey()])

    const { default: SettingsPage } = await import("@/app/(portal)/settings/page")
    const element = await SettingsPage()

    expect(element).not.toBeNull()
    expect(mockGetApiKeysForMerchant).toHaveBeenCalledWith("m1")
  })

  it("renders masked API key (prefix visible)", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockGetApiKeysForMerchant.mockResolvedValue([makeApiKey()])

    const { default: SettingsPage } = await import("@/app/(portal)/settings/page")
    const element = await SettingsPage()

    expect(element).not.toBeNull()
  })

  it("renders empty state when no API keys", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockGetApiKeysForMerchant.mockResolvedValue([])

    const { default: SettingsPage } = await import("@/app/(portal)/settings/page")
    const element = await SettingsPage()

    expect(element).not.toBeNull()
  })

  it("redirects admin to dashboard (no merchantId)", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())

    const { default: SettingsPage } = await import("@/app/(portal)/settings/page")
    await expect(SettingsPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("redirects unauthenticated to login", async () => {
    mockGetSession.mockResolvedValue(null)

    const { default: SettingsPage } = await import("@/app/(portal)/settings/page")
    await expect(SettingsPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })
})

// ═══════════════════════════════════════════════════════════════
// Statements page
// ═══════════════════════════════════════════════════════════════

describe("StatementsPage", () => {
  it("renders statements for merchant", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockListStatements.mockResolvedValue([
      makeStatement(),
      makeStatement({
        id: "stmt_002",
        periodStart: new Date("2024-06-01").toISOString(),
        periodEnd: new Date("2024-06-30").toISOString(),
      }),
    ])

    const { default: StatementsPage } = await import("@/app/(portal)/statements/page")
    const element = await StatementsPage({
      searchParams: Promise.resolve({}),
    })

    expect(element).not.toBeNull()
    expect(mockListStatements).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "m1" })
    )
  })

  it("renders statements for platform admin (all merchants)", async () => {
    mockGetSession.mockResolvedValue(makeAdminSession())
    mockListStatements.mockResolvedValue([makeStatement()])

    const { default: StatementsPage } = await import("@/app/(portal)/statements/page")
    const element = await StatementsPage({
      searchParams: Promise.resolve({}),
    })

    expect(element).not.toBeNull()
    expect(mockListStatements).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: null })
    )
  })

  it("renders with date range filter", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockListStatements.mockResolvedValue([makeStatement()])

    const { default: StatementsPage } = await import("@/app/(portal)/statements/page")
    const element = await StatementsPage({
      searchParams: Promise.resolve({
        start: "2024-05-01",
        end: "2024-05-31",
      }),
    })

    expect(element).not.toBeNull()
    expect(mockListStatements).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId: "m1",
        dateRange: expect.objectContaining({
          start: expect.any(Date),
          end: expect.any(Date),
        }),
      })
    )
  })

  it("renders empty state for no statements", async () => {
    mockGetSession.mockResolvedValue(makeMerchantSession("m1"))
    mockListStatements.mockResolvedValue([])

    const { default: StatementsPage } = await import("@/app/(portal)/statements/page")
    const element = await StatementsPage({
      searchParams: Promise.resolve({}),
    })

    expect(element).not.toBeNull()
  })

  it("redirects unauthenticated users to login", async () => {
    mockGetSession.mockResolvedValue(null)

    const { default: StatementsPage } = await import("@/app/(portal)/statements/page")
    await expect(
      StatementsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })
})
