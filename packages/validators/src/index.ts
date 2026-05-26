import { z } from "zod/v4";

// ── Shared sub-schemas ────────────────────────────────────

export const cardSchema = z.object({
  number: z.string().min(10).max(19),
  expiry_month: z.number().int().min(1).max(12),
  expiry_year: z.number().int().min(2024).max(2099),
  cvc: z.string().min(3).max(4),
  cardholder_name: z.string().min(1).max(255).optional(),
  billing_address: z
    .object({
      line1: z.string().min(1).max(80),
      city: z.string().min(1).max(50),
      postal_code: z.string().min(1).max(15),
      country: z.string().length(2),
    })
    .optional(),
});

export const threeDSecureSchema = z.object({
  enabled: z.boolean().default(true),
  return_url: z.string().url().optional(),
  challenge_preference: z
    .enum([
      "noPreference",
      "noChallengeRequested",
      "challengeRequested",
      "challengeMandated",
    ])
    .optional(),
});

export const paymentMethodSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("card"),
    card: cardSchema,
  }),
  z.object({
    type: z.literal("card_token"),
    token: z.string().min(1).startsWith("pm_"),
  }),
]);

export const customerSchema = z
  .object({
    email: z.string().email().optional(),
    ip_address: z.string().optional(),
  })
  .optional();

export const deviceDataSchema = z
  .object({
    accept_header: z.string().optional(),
    user_agent: z.string().optional(),
    collection_reference: z.string().optional(),
  })
  .optional();

// ── Create PaymentIntent ──────────────────────────────────

export const createPaymentIntentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).toUpperCase(),
  payment_method: paymentMethodSchema,
  confirm: z.boolean().default(true),
  capture_method: z.enum(["automatic", "manual"]).default("automatic"),
  description: z.string().max(500).optional(),
  statement_descriptor: z.string().max(24).optional(),
  three_d_secure: threeDSecureSchema.default({ enabled: true }),
  customer: customerSchema,
  setup_future_usage: z.enum(["off_session"]).optional(),
  device_data: deviceDataSchema,
  metadata: z.record(z.string(), z.string()).optional(),
});

export type CreatePaymentIntentInput = z.infer<
  typeof createPaymentIntentSchema
>;

// ── Device Data ───────────────────────────────────────────

export const deviceDataSubmitSchema = z.object({
  collection_reference: z.string().min(1, "collection_reference is required"),
  accept_header: z.string().optional(),
  user_agent: z.string().optional(),
});

export type DeviceDataSubmitInput = z.infer<typeof deviceDataSubmitSchema>;

// ── Response types ────────────────────────────────────────

export interface PaymentIntentResponse {
  id: string;
  object: "payment_intent";
  amount: number;
  currency: string;
  status:
    | "created"
    | "processing"
    | "requires_device_data"
    | "requires_action"
    | "requires_capture"
    | "succeeded"
    | "canceled"
    | "payment_failed";
  capture_method: "automatic" | "manual";
  three_d_secure?: {
    status:
      | "authenticated"
      | "not_enrolled"
      | "unavailable"
      | "failed"
      | "not_requested";
  };
  next_action?: {
    type: "device_data_collection" | "three_d_secure_challenge";
    device_data_collection?: {
      ddc_url: string;
      ddc_jwt: string;
    };
    three_d_secure_challenge?: {
      challenge_url: string;
      challenge_jwt: string;
      challenge_payload: string;
      session_id: string;
    };
  };
  failure_code?: string;
  failure_message?: string;
  payment_method_details?: {
    type: string;
    card?: {
      brand: string;
      last4: string;
      expiry_month: number;
      expiry_year: number;
      funding: string;
      country: string;
    };
  };
  created: string;
}
