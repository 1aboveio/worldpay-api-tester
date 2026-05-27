import { test, expect } from "@playwright/test"

/**
 * Portal page smoke tests — verifies pages render without console errors
 * and static assets load correctly.
 *
 * Test plan: docs/tests/2026-05-27-codebase-test-audit.md (gap G4, T7)
 */

// Pages that should render without auth (or redirect gracefully)
const publicPages = ["/login", "/", "/register"]

// Pages that require authentication — we test that they redirect
const protectedPages = [
  "/dashboard",
  "/merchants",
  "/payments",
  "/payment-methods",
  "/refunds",
  "/settings",
  "/statements",
]

test.describe("Public pages", () => {
  for (const path of publicPages) {
    test(`${path} loads without console errors`, async ({ page }) => {
      const errors: string[] = []
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text())
      })
      page.on("pageerror", (err) => errors.push(err.message))

      await page.goto(path)
      await page.waitForLoadState("networkidle")

      const realErrors = errors.filter(
        (e) =>
          !e.includes("Better Auth") &&
          !e.includes("better-auth") &&
          !e.includes("favicon"),
      )
      expect(realErrors).toEqual([])
    })

    test(`${path} loads without 404 static assets`, async ({ page }) => {
      const failed: string[] = []
      page.on("response", (r) => {
        if (r.status() >= 400 && r.url().includes("/_next/static/")) {
          failed.push(`${r.status()} ${r.url().split("/").pop()}`)
        }
      })
      await page.goto(path)
      await page.waitForLoadState("networkidle")
      expect(failed).toEqual([])
    })
  }
})

test.describe("Protected pages redirect unauthenticated users", () => {
  for (const path of protectedPages) {
    test(`${path} redirects to /login when not authenticated`, async ({
      page,
    }) => {
      const response = await page.goto(path)
      await page.waitForLoadState("networkidle")

      // Either the page redirects to login or the URL contains /login
      const url = page.url()
      expect(url).toMatch(/\/login|^about:blank/)
    })
  }
})

test.describe("Portal static assets", () => {
  test("/_next/static/ CSS chunks return 200", async ({ page }) => {
    const cssStatuses: number[] = []
    page.on("response", (r) => {
      if (r.url().includes("/_next/static/") && r.url().endsWith(".css")) {
        cssStatuses.push(r.status())
      }
    })
    await page.goto("/login")
    await page.waitForLoadState("networkidle")
    expect(cssStatuses.length).toBeGreaterThan(0)
    expect(cssStatuses.every((s) => s === 200)).toBe(true)
  })

  test("/_next/static/ JS chunks return 200", async ({ page }) => {
    const jsStatuses: number[] = []
    page.on("response", (r) => {
      if (r.url().includes("/_next/static/") && r.url().endsWith(".js")) {
        jsStatuses.push(r.status())
      }
    })
    await page.goto("/login")
    await page.waitForLoadState("networkidle")
    expect(jsStatuses.length).toBeGreaterThan(0)
    expect(jsStatuses.every((s) => s === 200)).toBe(true)
  })
})
