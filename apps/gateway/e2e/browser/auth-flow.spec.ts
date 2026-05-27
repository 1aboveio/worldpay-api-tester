import { test, expect } from "@playwright/test"

/**
 * Auth flow tests using Better Auth API endpoints.
 *
 * Note: Full registration → sign-in → dashboard flow requires UserMerchant
 * records to be seeded for fmmpay.com users after registration. This is
 * handled by the curl-based E2E tests (e2e-test.sh) which seed records
 * via psql. Playwright tests focus on the API-level auth behaviors that
 * don't require Postgres-level seeding.
 *
 * The curl E2E suite already covers: admin registration, merchant
 * registration, login, dashboard access, merchant impersonation, and
 * return-to-platform flows with real Better Auth sessions.
 */

test.describe("Auth API", () => {
  test("sign-in with invalid credentials returns error status", async ({
    request,
  }) => {
    const signInRes = await request.post("/api/auth/sign-in/email", {
      data: { email: "nobody@fmmpay.com", password: "WrongPass1!" },
      headers: { "Content-Type": "application/json" },
    })
    // Better Auth returns 400, 401, or 403 for invalid credentials
    expect([400, 401, 403]).toContain(signInRes.status())
  })

  test("sign-in with empty credentials returns error", async ({ request }) => {
    const signInRes = await request.post("/api/auth/sign-in/email", {
      data: { email: "", password: "" },
      headers: { "Content-Type": "application/json" },
    })
    expect([400, 401, 403]).toContain(signInRes.status())
  })

  test("registration validation rejects malformed request", async ({
    request,
  }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      data: { email: "not-an-email", password: "12" },
      headers: { "Content-Type": "application/json" },
    })
    // Better Auth returns error for invalid input
    expect([400, 401, 403]).toContain(res.status())
  })
})

test.describe("Protected pages auth guard", () => {
  const protectedPaths = [
    "/dashboard",
    "/merchants",
    "/payments",
    "/settings",
  ]

  for (const path of protectedPaths) {
    test(`${path} requires authentication`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState("networkidle")

      // Should redirect to login when not authenticated
      const url = page.url()
      expect(url).toMatch(/\/login/)
    })
  }
})
