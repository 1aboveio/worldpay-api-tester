import "server-only"
import { database } from "@repo/database"

export async function getCheckoutSessionById(id: string) {
  return database.checkoutSession.findUnique({ where: { id } })
}

export async function listCheckoutSessionsByMerchant(merchantId: string, limit = 20) {
  return database.checkoutSession.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}
