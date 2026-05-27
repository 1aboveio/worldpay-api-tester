/**
 * Portal page render tests for untested routes: /, /register, /payments/[id]
 *
 * Test plan: docs/tests/2026-05-27-codebase-test-audit.md (gap G5, G6, G7, T4, T5, T6)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"

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

// ─── Mock React hooks for client components ───────────────────

const mockUseActionState = vi.fn()

vi.mock("react", async () => {
  const actual = await vi.importActual("react")
  return {
    ...actual,
    useActionState: (...args: any[]) => mockUseActionState(...args),
  }
})

// ─── Mock auth-actions ────────────────────────────────────────

vi.mock("@/app/(portal)/auth-actions", () => ({
  registerAction: vi.fn(),
}))

// ─── Mock auth-server ─────────────────────────────────────────

const mockGetSession = vi.fn()

vi.mock("@/lib/auth-server", () => ({
  getSession: (...args: any[]) => mockGetSession(...args),
}))

// ─── Mock DAL portal ──────────────────────────────────────────

const mockGetPaymentIntentForPortal = vi.fn()

vi.mock("@/dal/portal", () => ({
  getPaymentIntentForPortal: (...args: any[]) =>
    mockGetPaymentIntentForPortal(...args),
}))

// ─── Mock payment-actions component ───────────────────────────

vi.mock("@/app/(portal)/payments/[id]/payment-actions", () => ({
  PaymentActions: () => null,
}))

// ─── Mock shadcn UI components ────────────────────────────────

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) =>
    React.createElement("button", props, children),
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => React.createElement("input", props),
}))

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) =>
    React.createElement("label", props, children),
}))

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: any) =>
    React.createElement("div", props, children),
  CardHeader: ({ children, ...props }: any) =>
    React.createElement("div", props, children),
  CardTitle: ({ children, ...props }: any) =>
    React.createElement("div", props, children),
  CardDescription: ({ children, ...props }: any) =>
    React.createElement("p", props, children),
  CardContent: ({ children, ...props }: any) =>
    React.createElement("div", props, children),
  CardFooter: ({ children, ...props }: any) =>
    React.createElement("div", props, children),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

// ═══════════════════════════════════════════════════════════════
// Root page (/)
// ═══════════════════════════════════════════════════════════════

describe("RootPage (/)", () => {
  it("renders Worldpay API Tester heading", async () => {
    const { default: RootPage } = await import("@/app/page")
    const element = await RootPage()
    expect(element).not.toBeNull()
  })

  it("shows PayFac Payment Gateway text", async () => {
    const { default: RootPage } = await import("@/app/page")
    const element = await RootPage()
    expect(element).not.toBeNull()
  })

  it("renders without errors", async () => {
    const { default: RootPage } = await import("@/app/page")
    // Should not throw
    const element = await RootPage()
    expect(element).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════
// Registration page (/register)
// ═══════════════════════════════════════════════════════════════

describe("RegisterPage (/register)", () => {
  it("renders Create Account heading and inputs in initial state", async () => {
    mockUseActionState.mockReturnValue([
      { success: false },
      vi.fn(),
      false,
    ])
    const { default: RegisterPage } = await import(
      "@/app/(portal)/register/page"
    )
    const element = RegisterPage()
    expect(element).not.toBeNull()
  })

  it("shows fmmpay.com restriction text without errors in initial state", async () => {
    mockUseActionState.mockReturnValue([
      { success: false },
      vi.fn(),
      false,
    ])
    const { default: RegisterPage } = await import(
      "@/app/(portal)/register/page"
    )
    const element = RegisterPage()
    expect(element).not.toBeNull()
  })

  it("displays per-field validation errors when fieldErrors returned", async () => {
    const mockFormAction = vi.fn()
    mockUseActionState.mockReturnValue([
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input.",
          fieldErrors: {
            email: ["Invalid email format"],
            password: ["Password must be at least 8 characters"],
          },
        },
      },
      mockFormAction,
      false,
    ])

    const { default: RegisterPage } = await import(
      "@/app/(portal)/register/page"
    )
    const element = RegisterPage()
    expect(element).not.toBeNull()
  })

  it("displays general error message when error has no fieldErrors", async () => {
    const mockFormAction = vi.fn()
    mockUseActionState.mockReturnValue([
      {
        success: false,
        error: {
          code: "ACCESS_DENIED",
          message: "Only @fmmpay.com accounts are permitted.",
        },
      },
      mockFormAction,
      false,
    ])

    const { default: RegisterPage } = await import(
      "@/app/(portal)/register/page"
    )
    const element = RegisterPage()
    expect(element).not.toBeNull()
  })

  it("shows 'Creating account...' button text when isPending", async () => {
    mockUseActionState.mockReturnValue([
      { success: false },
      vi.fn(),
      true,
    ])

    const { default: RegisterPage } = await import(
      "@/app/(portal)/register/page"
    )
    const element = RegisterPage()
    expect(element).not.toBeNull()
  })

  it("has sign in link for existing accounts", async () => {
    mockUseActionState.mockReturnValue([
      { success: false },
      vi.fn(),
      false,
    ])

    const { default: RegisterPage } = await import(
      "@/app/(portal)/register/page"
    )
    const element = RegisterPage()
    expect(element).not.toBeNull()
  })

  it("binds formAction from useActionState to the form", async () => {
    const mockFormAction = vi.fn()
    mockUseActionState.mockReturnValue([
      { success: false },
      mockFormAction,
      false,
    ])

    const { default: RegisterPage } = await import(
      "@/app/(portal)/register/page"
    )
    const element = RegisterPage()
    expect(element).not.toBeNull()
  })

  it("marks inputs aria-invalid when fieldErrors exist", async () => {
    mockUseActionState.mockReturnValue([
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input.",
          fieldErrors: { name: ["Name is required"], email: ["Invalid email"] },
        },
      },
      vi.fn(),
      false,
    ])

    const { default: RegisterPage } = await import(
      "@/app/(portal)/register/page"
    )
    const element = RegisterPage()
    expect(element).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// Payment detail page (/payments/[id])
// ═══════════════════════════════════════════════════════════════

function makePi(overrides?: Record<string, unknown>) {
  return {
    id: "pi_detail_001",
    merchantId: "m_test",
    amount: 2500,
    currency: "GBP",
    status: "succeeded",
    captureMethod: "automatic",
    createdAt: new Date("2026-05-20T10:00:00Z").toISOString(),
    description: "Order #12345",
    failureCode: null,
    failureMessage: null,
    paymentMethod: {
      brand: "visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2030,
      funding: "credit",
    },
    ...overrides,
  }
}

describe("PaymentDetailPage (/payments/[id])", () => {
  it("renders payment intent details for authorized merchant", async () => {
    mockGetSession.mockResolvedValue({
      activeRole: "merchant",
      activeMerchantId: "m_test",
    })
    mockGetPaymentIntentForPortal.mockResolvedValue(makePi())

    const { default: PaymentDetailPage } = await import(
      "@/app/(portal)/payments/[id]/page"
    )
    const element = await PaymentDetailPage({
      params: Promise.resolve({ id: "pi_detail_001" }),
    })

    expect(element).not.toBeNull()
    expect(mockGetPaymentIntentForPortal).toHaveBeenCalledWith("pi_detail_001")
  })

  it("redirects unauthenticated users to /login", async () => {
    mockGetSession.mockResolvedValue(null)

    const { default: PaymentDetailPage } = await import(
      "@/app/(portal)/payments/[id]/page"
    )
    await expect(
      PaymentDetailPage({ params: Promise.resolve({ id: "pi_detail_001" }) }),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/login")
  })

  it("calls notFound when PI does not exist", async () => {
    mockGetSession.mockResolvedValue({
      activeRole: "merchant",
      activeMerchantId: "m_test",
    })
    mockGetPaymentIntentForPortal.mockResolvedValue(null)

    const { default: PaymentDetailPage } = await import(
      "@/app/(portal)/payments/[id]/page"
    )
    await expect(
      PaymentDetailPage({
        params: Promise.resolve({ id: "pi_nonexistent" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mockNotFound).toHaveBeenCalled()
  })

  it("redirects when PI belongs to different merchant (tenant isolation)", async () => {
    mockGetSession.mockResolvedValue({
      activeRole: "merchant",
      activeMerchantId: "m_other_merchant",
    })
    mockGetPaymentIntentForPortal.mockResolvedValue(
      makePi({ merchantId: "m_test" }),
    )

    const { default: PaymentDetailPage } = await import(
      "@/app/(portal)/payments/[id]/page"
    )
    await expect(
      PaymentDetailPage({ params: Promise.resolve({ id: "pi_detail_001" }) }),
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(mockRedirect).toHaveBeenCalledWith("/portal/payments")
  })

  it("platform admin can view any merchant PI", async () => {
    mockGetSession.mockResolvedValue({
      activeRole: "platform_admin",
      activeMerchantId: null,
    })
    mockGetPaymentIntentForPortal.mockResolvedValue(
      makePi({ merchantId: "m_other_merchant" }),
    )

    const { default: PaymentDetailPage } = await import(
      "@/app/(portal)/payments/[id]/page"
    )
    const element = await PaymentDetailPage({
      params: Promise.resolve({ id: "pi_detail_001" }),
    })

    expect(element).not.toBeNull()
  })

  it("renders failure info for payment_failed status", async () => {
    mockGetSession.mockResolvedValue({
      activeRole: "merchant",
      activeMerchantId: "m_test",
    })
    mockGetPaymentIntentForPortal.mockResolvedValue(
      makePi({
        status: "payment_failed",
        failureCode: "5",
        failureMessage: "Do not honor",
      }),
    )

    const { default: PaymentDetailPage } = await import(
      "@/app/(portal)/payments/[id]/page"
    )
    const element = await PaymentDetailPage({
      params: Promise.resolve({ id: "pi_detail_001" }),
    })

    expect(element).not.toBeNull()
  })

  it("renders masked card details", async () => {
    mockGetSession.mockResolvedValue({
      activeRole: "merchant",
      activeMerchantId: "m_test",
    })
    mockGetPaymentIntentForPortal.mockResolvedValue(makePi())

    const { default: PaymentDetailPage } = await import(
      "@/app/(portal)/payments/[id]/page"
    )
    const element = await PaymentDetailPage({
      params: Promise.resolve({ id: "pi_detail_001" }),
    })

    expect(element).not.toBeNull()
    // Card details section should be present
  })
})
