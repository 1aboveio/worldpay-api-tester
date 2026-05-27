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
  // Hosted-fields (Worldpay Access Checkout): the browser produces a one-time
  // session href; the raw PAN never reaches our server.
  z.object({
    type: z.literal("checkout_session"),
    session_href: z.string().min(1),
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
  three_d_secure: z.object({
    enabled: z.boolean().optional(),
    return_url: z.string().optional(),
  }).optional(),
})

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>

export const capturePaymentIntentSchema = z.object({
  amount_to_capture: z.number().int().optional(),
})

export type CapturePaymentIntentInput = z.infer<typeof capturePaymentIntentSchema>

export const paymentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  created_since: z.string().datetime({ message: "created_since must be ISO 8601" }).optional(),
})

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>

export const statementsQuerySchema = z.object({
  from: z.string().datetime({ message: "from must be ISO 8601" }),
  to: z.string().datetime({ message: "to must be ISO 8601" }),
  page: z.coerce.number().int().min(1).optional().default(1),
})
