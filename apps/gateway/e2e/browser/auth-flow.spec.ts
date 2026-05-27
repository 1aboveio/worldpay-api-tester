import { test, expect } from "@playwright/test"

/**
 * Real auth flow tests — registers a user, signs in, and verifies
 * protected pages render correctly with real Better Auth sessions.
 *
 * These tests run in CI against a real Postgres + Better Auth instance.
 * Skip locally if no server is configured.
 */

test.describe("Real auth flow (register → sign in → dashboard)", () => {
  const ADMIN_EMAIL = `e2e-admin-${Date.now()}@fmmpay.com`
  const ADMIN_PASSWORD = "Test1234!"

  test("register admin, sign in, and access dashboard", async ({ page, request }) => {
    // Step 1: Register via Better Auth API
    const signUpRes = await request.post("/api/auth/sign-up/email", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: "E2E Admin" },
      headers: { "Content-Type": "application/json" },
    })
    expect(signUpRes.status()).toBe(200)

    // Step 2: Sign in via Better Auth API to get session cookie
    const signInRes = await request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      headers: { "Content-Type": "application/json" },
    })
    expect(signInRes.status()).toBe(200)

    // Extract cookies from sign-in response
    const setCookie = signInRes.headers()["set-cookie"]
    expect(setCookie).toBeDefined()
    const cookies = setCookie!.split(",").map(c => {
      const [nameValue] = c.trim().split(";")
      const [name, value] = nameValue.split("=")
      return { name: name.trim(), value: value.trim(), domain: "localhost", path: "/" }
    })
    await page.context().addCookies(cookies)

    // Step 3: Access dashboard — should render with real session
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // Should be on dashboard (not redirected to login)
    const url = page.url()
    expect(url).toContain("/dashboard")
  })

  test("sign in with invalid credentials shows error", async ({ request }) => {
    const signInRes = await request.post("/api/auth/sign-in/email", {
      data: { email: "nobody@fmmpay.com", password: "WrongPass1!" },
      headers: { "Content-Type": "application/json" },
    })
    // Better Auth returns 400/401 for invalid credentials
    expect([400, 401, 403]).toContain(signInRes.status())
  })

  test("protected page redirects to login when not authenticated", async ({ page }) => {
    const response = await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    // Should redirect to login or show login page
    const url = page.url()
    expect(url).toMatch(/\/login/)
  })
})
