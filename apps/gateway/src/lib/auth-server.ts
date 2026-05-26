"use server"

import "server-only"
import { auth } from "./auth"
import { headers } from "next/headers"
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

/**
 * Get the raw Better Auth session (no UserMerchant enrichment).
 * Returns the session user info or null if no valid session.
 */
export async function getAuthSession() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })
    if (!session?.user) return null
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    }
  } catch {
    return null
  }
}

/**
 * Enrich a session with UserMerchant data.
 * Call this from a regular Server Component (not a "use server" file).
 */
export async function enrichSession(user: { id: string; email: string; name?: string | null }) {
  // Dynamic import to avoid Turbopack RSC bundling issues
  const { database } = await import("@repo/database")
  
  const userMerchants = await database.userMerchant.findMany({
    where: { userId: user.id },
  })

  if (userMerchants.length === 0) return null

  // Fetch merchant names separately (UserMerchant model has no relation field)
  const merchantIds = userMerchants.map((um: Record<string, unknown>) => um.merchantId as string)
  const merchants = await database.merchant.findMany({
    where: { id: { in: merchantIds } },
    select: { id: true, name: true },
  })
  const merchantMap = new Map(merchants.map(m => [m.id, m.name]))

  const isPlatformAdmin = userMerchants.some(
    (um: Record<string, unknown>) => um.role === "platform_admin",
  )

  const availableMerchants = userMerchants.map((um: Record<string, unknown>) => ({
    merchantId: um.merchantId as string,
    merchantName: merchantMap.get(um.merchantId as string) ?? "Unknown",
    role: um.role as string,
  }))

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
    if (activeMerchantCookie && availableMerchants.some(m => m.merchantId === activeMerchantCookie)) {
      activeMerchantId = activeMerchantCookie
    } else {
      activeMerchantId = availableMerchants[0]?.merchantId ?? null
    }
  }

  return {
    user,
    activeRole,
    activeMerchantId,
    availableMerchants,
    isPlatformAdmin,
  } satisfies EnrichedSession
}

/**
 * Full session retrieval with UserMerchant enrichment.
 * Use this from portal layout/page Server Components.
 */
export async function getSession(): Promise<EnrichedSession> {
  try {
    const user = await getAuthSession()
    if (!user) return null
    return await enrichSession(user)
  } catch (err) {
    console.error("[getSession] Error:", err instanceof Error ? err.message : String(err))
    return null
  }
}
