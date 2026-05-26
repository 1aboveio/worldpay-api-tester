import { z } from "zod/v4";

const billingAddressSchema = z.object({
  line1: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
});

export const createPaymentMethodSchema = z.object({
  type: z.literal("card"),
  card: z.object({
    number: z
      .string()
      .min(10, "Card number too short")
      .max(19, "Card number too long")
      .regex(/^\d+$/, "Card number must be digits only"),
    expiry_month: z.number().int().min(1).max(12),
    expiry_year: z.number().int().min(2020).max(2099),
    cvc: z
      .string()
      .regex(/^\d{3,4}$/, "CVC must be 3-4 digits"),
    cardholder_name: z.string().optional(),
    billing_address: billingAddressSchema.optional(),
  }),
});

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;
