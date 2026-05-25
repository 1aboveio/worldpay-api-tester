import { z } from "zod/v4"

const cardSchema = z.object({
  number: z.string().min(12).max(19),
  expiry_month: z.number().int().min(1).max(12),
  expiry_year: z.number().int().min(2024).max(2099),
  cvc: z.string().min(3).max(4),
  cardholder_name: z.string().optional(),
  billing_address: z
    .object({
      line1: z.string().optional(),
      city: z.string().optional(),
      postal_code: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
})

const paymentMethodSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("card"),
    card: cardSchema,
  }),
  z.object({
    type: z.literal("card_token"),
    token: z.string().min(1),
  }),
])

const customerSchema = z
  .object({
    email: z.string().email().optional(),
    ip_address: z.string().optional(),
  })
  .optional()

const shippingSchema = z.record(z.string(), z.unknown()).optional()

export const createPaymentIntentSchema = z.object({
  amount: z.number().int().min(1),
  currency: z.string().min(3).max(3),
  payment_method: paymentMethodSchema,
  confirm: z.boolean().optional().default(true),
  capture_method: z.enum(["automatic", "manual"]).optional().default("automatic"),
  description: z.string().max(500).optional(),
  statement_descriptor: z.string().max(100).optional(),
  setup_future_usage: z.enum(["off_session"]).optional(),
  customer: customerSchema,
  shipping: shippingSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>

// ─── List Payment Intents Query ────────────────────────────────────

export const listPaymentIntentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  created_since: z.string().optional(),
})

export type ListPaymentIntentsQuery = z.infer<typeof listPaymentIntentsQuerySchema>

// ─── Statements Query ───────────────────────────────────────────

export const statementsQuerySchema = z.object({
  from: z.string().min(1, "from date is required"),
  to: z.string().min(1, "to date is required"),
  page: z.coerce.number().int().min(1).optional().default(1),
}).superRefine((data, ctx) => {
  const fromDate = new Date(data.from)
  const toDate = new Date(data.to)

  if (isNaN(fromDate.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "from must be a valid ISO 8601 date",
      path: ["from"],
    })
  }

  if (isNaN(toDate.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "to must be a valid ISO 8601 date",
      path: ["to"],
    })
    return
  }

  const diffMs = toDate.getTime() - fromDate.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "to must be after from",
      path: ["to"],
    })
  }

  if (diffDays > 31) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Date range must not exceed 31 days",
      path: ["to"],
    })
  }
})

export type StatementsQuery = z.infer<typeof statementsQuerySchema>
