"use server"

import { auth } from "@/lib/auth"
import { database } from "@repo/database"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-server"
import { loginSchema, registerSchema, type ActionResult, isAllowedEmail } from "./auth-schemas"

function isFmmpayEmail(email: string): boolean {
  return isAllowedEmail(email)
}

export async function loginAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData)
  const parsed = loginSchema.safeParse(raw)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as string
      if (!fieldErrors[key]) fieldErrors[key] = []
      fieldErrors[key].push(issue.message)
    }
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input.", fieldErrors } }
  }

  if (!isFmmpayEmail(parsed.data.email)) {
    return { success: false, error: { code: "ACCESS_DENIED", message: `Only @${process.env.ALLOWED_EMAIL_DOMAIN || "fmmpay.com"} accounts are permitted.` } }
  }

  try {
    const result = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
      headers: await headers(),
    })

    if (!result?.user) {
      return { success: false, error: { code: "AUTH_ERROR", message: "Invalid email or password." } }
    }
  } catch {
    return { success: false, error: { code: "AUTH_ERROR", message: "Invalid email or password." } }
  }

  redirect("/dashboard")
}

export async function registerAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = Object.fromEntries(formData)
  const parsed = registerSchema.safeParse(raw)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as string
      if (!fieldErrors[key]) fieldErrors[key] = []
      fieldErrors[key].push(issue.message)
    }
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input.", fieldErrors } }
  }

  if (!isFmmpayEmail(parsed.data.email)) {
    return { success: false, error: { code: "ACCESS_DENIED", message: `Only @${process.env.ALLOWED_EMAIL_DOMAIN || "fmmpay.com"} accounts are permitted.` } }
  }

  const { email, password, name } = parsed.data

  try {
    const existing = await database.user.findUnique({ where: { email } })
    if (existing) {
      return { success: false, error: { code: "CONFLICT", message: "An account with this email already exists." } }
    }

    const result = await auth.api.signUpEmail({
      body: { email, password, name },
      headers: await headers(),
    })

    if (!result?.user) {
      return { success: false, error: { code: "AUTH_ERROR", message: "Registration failed." } }
    }

    const userId = result.user.id

    const allMerchants = await database.merchant.findMany()
    for (const merchant of allMerchants) {
      await database.userMerchant.create({
        data: { userId, merchantId: merchant.id as string, role: "platform_admin" },
      })
    }
  } catch (err) {
    console.error("Registration error:", err)
    return { success: false, error: { code: "INTERNAL_ERROR", message: "Registration failed." } }
  }

  redirect("/dashboard")
}

export async function logoutAction() {
  await auth.api.signOut({ headers: await headers() })
  redirect("/login")
}

export async function getPortalSession() {
  return getSession()
}
