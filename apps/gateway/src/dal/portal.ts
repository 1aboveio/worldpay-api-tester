import "server-only"
import { database } from "@repo/database"
import type { PaymentIntentStatus } from "@repo/database"

// ─── Portal User ──────────────────────────────────────────────

export async function getPortalUserByEmail(email: string) {
  return database.user.findUnique({ where: { email } })
}

// ─── UserMerchant ─────────────────────────────────────────────

export async function getUserMerchants(userId: string) {
  return database.userMerchant.findMany({
    where: { userId },
    include: { merchant: true },
  })
}

// ─── Merchants ────────────────────────────────────────────────

export async function listMerchants() {
  return database.merchant.findMany({
    orderBy: { name: "asc" },
    include: { apiKeys: true },
  })
}

export async function getMerchantById(id: string) {
  return database.merchant.findUnique({
    where: { id },
    include: { apiKeys: true },
  })
}

export async function getMerchantCount() {
  return database.merchant.count()
}

export async function updateMerchantPayFacConfig(
  merchantId: string,
  payFacConfig: Record<string, unknown>,
) {
  return database.merchant.update({
    where: { id: merchantId },
    data: { payFacConfig },
  })
}

// ─── FraudSight ────────────────────────────────────────────────

export async function updateFraudSightConfig(
  merchantId: string,
  fraudsight: {
    enabled: boolean
    actionOnHighRisk?: string
    actionOnReview?: string
    exemption?: boolean
    capability?: string
  },
) {
  const merchant = await database.merchant.findUnique({
    where: { id: merchantId },
  })

  if (!merchant) throw new Error("Merchant not found")

  const currentConfig = (merchant.payFacConfig as Record<string, unknown>) ?? {}
  const currentFraudsight = (currentConfig.fraudsight as Record<string, unknown>) ?? {}

  const updatedFraudsight = {
    ...currentFraudsight,
    enabled: fraudsight.enabled,
    ...(fraudsight.actionOnHighRisk !== undefined && {
      actionOnHighRisk: fraudsight.actionOnHighRisk,
    }),
    ...(fraudsight.actionOnReview !== undefined && {
      actionOnReview: fraudsight.actionOnReview,
    }),
    ...(fraudsight.exemption !== undefined && {
      exemption: fraudsight.exemption,
    }),
    ...(fraudsight.capability !== undefined && {
      capability: fraudsight.capability,
    }),
  }

  return database.merchant.update({
    where: { id: merchantId },
    data: {
      payFacConfig: {
        ...currentConfig,
        fraudsight: updatedFraudsight,
      },
    },
  })
}

// ─── Payment Intents ──────────────────────────────────────────

export type ListPaymentIntentsInput = {
  merchantId?: string | null
  status?: string
  dateRange?: { start: Date; end: Date }
  skip?: number
  take?: number
}

export async function listPaymentIntents(input: ListPaymentIntentsInput) {
  const where: Record<string, unknown> = {}

  if (input.merchantId) {
    where.merchantId = input.merchantId
  }

  if (input.status) {
    where.status = input.status
  }

  if (input.dateRange) {
    where.createdAt = {
      gte: input.dateRange.start,
      lte: input.dateRange.end,
    }
  }

  const [items, total] = await Promise.all([
    database.paymentIntent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: input.skip ?? 0,
      take: input.take ?? 20,
    }),
    database.paymentIntent.count({ where }),
  ])

  return { items, total }
}

export async function getPaymentIntentForPortal(id: string) {
  const pi = await database.paymentIntent.findUnique({
    where: { id },
  })
  if (!pi) return null

  const paymentMethod = pi.paymentMethodId
    ? await database.paymentMethod.findUnique({
        where: { id: pi.paymentMethodId as string },
      })
    : null

  return { ...pi, paymentMethod }
}

export async function getPaymentIntentCount(input: {
  merchantId?: string | null
  status?: string
}) {
  const where: Record<string, unknown> = {}
  if (input.merchantId) where.merchantId = input.merchantId
  if (input.status) where.status = input.status
  return database.paymentIntent.count({ where })
}

// ─── Payment Methods ──────────────────────────────────────────

export async function listPaymentMethods(merchantId: string) {
  return database.paymentMethod.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
  })
}

// ─── Refunds ──────────────────────────────────────────────────

export async function listRefunds(merchantId: string) {
  return database.refund.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    include: { paymentIntent: true },
  })
}

export async function getRefundCount(merchantId: string) {
  return database.refund.count({ where: { merchantId } })
}

// ─── Statements ───────────────────────────────────────────────

export async function listStatements(input: {
  merchantId?: string | null
  dateRange?: { start: Date; end: Date }
}) {
  const where: Record<string, unknown> = {}
  if (input.merchantId) where.merchantId = input.merchantId
  if (input.dateRange) {
    where.periodStart = { gte: input.dateRange.start }
    where.periodEnd = { lte: input.dateRange.end }
  }

  return database.statement.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })
}

// ─── Stats ────────────────────────────────────────────────────

export async function getMerchantStats(merchantId?: string | null) {
  const where: Record<string, unknown> = {}
  if (merchantId) where.merchantId = merchantId

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [totalPIs, todayPIs, succeeded, refunds, merchantCount] = await Promise.all([
    database.paymentIntent.count({ where }),
    database.paymentIntent.count({
      where: { ...where, createdAt: { gte: today } },
    }),
    database.paymentIntent.count({
      where: { ...where, status: "succeeded" },
    }),
    database.refund.count({
      where: merchantId ? { merchantId } : {},
    }),
    merchantId ? Promise.resolve(1) : database.merchant.count(),
  ])

  return {
    totalPayments: totalPIs,
    paymentsToday: todayPIs,
    succeededPayments: succeeded,
    successRate: totalPIs > 0 ? Math.round((succeeded / totalPIs) * 100) : 0,
    totalRefunds: refunds,
    merchantCount,
  }
}

// ─── Settings / API Key ───────────────────────────────────────

export async function getApiKeysForMerchant(merchantId: string) {
  return database.apiKey.findMany({
    where: { merchantId, isActive: true },
  })
}

export async function regenerateApiKey(merchantId: string, oldKeyId: string) {
  const newPrefix = "sk_live_"
  const newHash = `hash_${Math.random().toString(36).slice(2, 12)}`

  await database.apiKey.update({
    where: { id: oldKeyId },
    data: { isActive: false },
  })

  return database.apiKey.create({
    data: {
      merchantId,
      prefix: newPrefix,
      keyHash: newHash,
      isActive: true,
    },
  })
}
