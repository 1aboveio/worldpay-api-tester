"use server"

import { z } from "zod"
import { auth } from "@/lib/auth"
import { database } from "@repo/database"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-server"

// ─── Schemas ───────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const registerSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
})

// ─── Action Result ─────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean
  data?: T
  error?: { code: string; message: string; fieldErrors?: Record<string, string[]> }
}

// ─── Login ─────────────────────────────────────────────────────

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

  redirect("/portal/dashboard")
}

// ─── Register ──────────────────────────────────────────────────

function isFmmpayEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@fmmpay.com")
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

  const { email, password, name } = parsed.data
  const isPlatformAdmin = isFmmpayEmail(email)

  try {
    // Check if user already exists
    const existing = await database.user.findUnique({ where: { email } })
    if (existing) {
      return { success: false, error: { code: "CONFLICT", message: "An account with this email already exists." } }
    }

    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
      headers: await headers(),
    })

    if (!result?.user) {
      return { success: false, error: { code: "AUTH_ERROR", message: "Registration failed." } }
    }

    const userId = result.user.id

    // Assign merchant roles based on email domain
    if (isPlatformAdmin) {
      // @fmmpay.com → platform_admin for ALL merchants
      const allMerchants = await database.merchant.findMany()
      for (const merchant of allMerchants) {
        await database.userMerchant.create({
          data: {
            userId,
            merchantId: merchant.id as string,
            role: "platform_admin",
          },
        })
      }
    } else {
      // Non-fmmpay → assign to specific merchant(s)
      // For now, assign to the first merchant as default
      const firstMerchant = await database.merchant.findFirst()
      if (firstMerchant) {
        await database.userMerchant.create({
          data: {
            userId,
            merchantId: firstMerchant.id as string,
            role: "merchant",
          },
        })
      }
    }
  } catch (err) {
    console.error("Registration error:", err)
    return { success: false, error: { code: "INTERNAL_ERROR", message: "Registration failed. Please try again." } }
  }

  redirect("/portal/dashboard")
}

// ─── Logout ────────────────────────────────────────────────────

export async function logoutAction() {
  "use server"
  await auth.api.signOut({
    headers: await headers(),
  })
  redirect("/login")
}
