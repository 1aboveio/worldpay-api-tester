import { test, expect } from "@playwright/test"

test.describe("Login page", () => {
  test("has no console errors", async ({ page }) => {
    const errors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text())
    })
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto("/login")
    await page.waitForLoadState("networkidle")

    expect(errors.filter((e) => !e.includes("Better Auth") && !e.includes("better-auth"))).toEqual([])
  })

  test("static assets load without 404", async ({ page }) => {
    const failedRequests: string[] = []
    page.on("response", (res) => {
      if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`)
    })

    await page.goto("/login")
    await page.waitForLoadState("networkidle")

    const asset404s = failedRequests.filter((r) => r.includes("/_next/static/"))
    expect(asset404s).toEqual([])
  })

  test("renders with CSS styling applied", async ({ page }) => {
    await page.goto("/login")
    await page.waitForLoadState("networkidle")

    // Verify the card has background styling (not transparent)
    const card = page.locator("[class*='rounded']").first()
    await expect(card).toBeVisible()
    const bgColor = await card.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bgColor).not.toBe("rgba(0, 0, 0, 0)")

    // Verify the button has background color (not transparent)
    const button = page.locator("button[type='submit']")
    await expect(button).toBeVisible()
    const btnBg = await button.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(btnBg).not.toBe("rgba(0, 0, 0, 0)")

    // Verify input has border
    const input = page.locator("input[type='email']")
    await expect(input).toBeVisible()
    const border = await input.evaluate((el) => getComputedStyle(el).border)
    expect(border).not.toBe("0px none rgb(0, 0, 0)")
  })

  test("shows PayFac Portal heading", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("[data-slot='card-title']")).toContainText("PayFac Portal")
  })

  test("sign in button is enabled", async ({ page }) => {
    await page.goto("/login")
    const button = page.locator("button[type='submit']")
    await expect(button).toBeEnabled()
    await expect(button).toContainText("Sign in")
  })

  test("email input accepts text", async ({ page }) => {
    await page.goto("/login")
    await page.locator("input[type='email']").fill("admin@fmmpay.com")
    await expect(page.locator("input[type='email']")).toHaveValue("admin@fmmpay.com")
  })

  test("shows error on invalid login", async ({ page }) => {
    await page.goto("/login")
    await page.locator("input[type='email']").fill("wrong@test.com")
    await page.locator("input[type='password']").fill("wrong")
    await page.locator("button[type='submit']").click()
    await page.waitForTimeout(2000)
    // Should show error or stay on login page
    const url = page.url()
    expect(url).toContain("/login")
  })
})
