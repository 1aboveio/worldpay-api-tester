"use server"

import { auth } from "./auth"
import { headers } from "next/headers"
import { database } from "@repo/database"
import { cookies } from "next/headers"

export type EnrichedSession = {
  user: {
    id: string
    email: string
    name?: string | null
  }
  activeRole: "platform_admin" | "merchant"
  activeMerchantId: string | null
  availableMerchants: Array<{
    merchantId: string
    merchantName: string
    role: string
  }>
  isPlatformAdmin: boolean
} | null

const ACTIVE_MERCHANT_COOKIE = "activeMerchantId"
const ACTIVE_ROLE_COOKIE = "activeRole"

export async function getSession(): Promise<EnrichedSession> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user) return null

    const userMerchants = await database.userMerchant.findMany({
      where: { userId: session.user.id },
      include: { merchant: true },
    })

    if (userMerchants.length === 0) return null

    const isPlatformAdmin = userMerchants.some(
      (um: Record<string, unknown>) => um.role === "platform_admin",
    )

    const availableMerchants = userMerchants.map((um: Record<string, unknown>) => ({
      merchantId: um.merchantId as string,
      merchantName: (um.merchant as Record<string, unknown>)?.name as string ?? "Unknown",
      role: um.role as string,
    }))

    // Determine active role and merchant from cookies or defaults
    const cookieStore = await cookies()
    const activeRoleCookie = cookieStore.get(ACTIVE_ROLE_COOKIE)?.value
    const activeMerchantCookie = cookieStore.get(ACTIVE_MERCHANT_COOKIE)?.value

    let activeRole: "platform_admin" | "merchant"
    let activeMerchantId: string | null

    if (isPlatformAdmin && (!activeRoleCookie || activeRoleCookie === "platform_admin")) {
      activeRole = "platform_admin"
      activeMerchantId = null
    } else {
      activeRole = "merchant"
      // If there's a valid merchant cookie, use it
      if (activeMerchantCookie && availableMerchants.some(m => m.merchantId === activeMerchantCookie)) {
        activeMerchantId = activeMerchantCookie
      } else {
        // Auto-select first merchant
        activeMerchantId = availableMerchants[0]?.merchantId ?? null
      }
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      activeRole,
      activeMerchantId,
      availableMerchants,
      isPlatformAdmin,
    }
  } catch {
    return null
  }
}
