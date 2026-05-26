"use server"

import { z } from "zod"
import { getSession } from "@/lib/auth-server"
import { cookies } from "next/headers"

const switchMerchantSchema = z.object({
  merchantId: z.string().min(1),
})

export type ActionResult<T = unknown> = {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export async function switchMerchant(
  input: unknown,
): Promise<ActionResult<{ activeMerchantId: string | null; activeRole: string }>> {
  const session = await getSession()
  if (!session) {
    return { success: false, error: { code: "UNAUTHENTICATED", message: "Please sign in." } }
  }

  const parsed = switchMerchantSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input." } }
  }

  const { merchantId } = parsed.data

  // Check user has access to this merchant
  const merchantAccess = session.availableMerchants.find(
    (m) => m.merchantId === merchantId,
  )
  if (!merchantAccess) {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "No access to this merchant." },
    }
  }

  const cookieStore = await cookies()
  cookieStore.set("activeMerchantId", merchantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  })
  cookieStore.set("activeRole", "merchant", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  })

  return {
    success: true,
    data: { activeMerchantId: merchantId, activeRole: "merchant" },
  }
}

export async function switchToPlatformOverview(): Promise<
  ActionResult<{ activeMerchantId: null; activeRole: string }>
> {
  const session = await getSession()
  if (!session?.isPlatformAdmin) {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "Only platform admins can access overview." },
    }
  }

  const cookieStore = await cookies()
  cookieStore.set("activeRole", "platform_admin", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  })
  cookieStore.delete("activeMerchantId")

  return {
    success: true,
    data: { activeMerchantId: null, activeRole: "platform_admin" },
  }
}
