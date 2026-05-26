import "server-only"
import { database } from "@repo/database"

export type ListPaymentIntentsInput = {
  limit: number
  createdSince?: string | null
}

export async function listPaymentIntents(
  merchantId: string,
  input: ListPaymentIntentsInput,
) {
  const where: Record<string, unknown> = { merchantId }

  if (input.createdSince) {
    where.createdAt = {
      gte: new Date(input.createdSince),
    }
  }

  return database.paymentIntent.findMany({
    where,
    include: { paymentMethod: true },
    orderBy: { createdAt: "desc" },
    take: input.limit,
  })
}
