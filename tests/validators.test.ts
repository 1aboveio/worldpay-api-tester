/**
 * Tests for Zod validation schemas
 */
import { describe, it, expect } from "vitest";
import {
  createPaymentIntentSchema,
  deviceDataSubmitSchema,
  threeDSecureSchema,
} from "@payfac/validators";

describe("Zod validators", () => {
  describe("createPaymentIntentSchema", () => {
    it("should parse valid minimal card payment", () => {
      const result = createPaymentIntentSchema.safeParse({
        amount: 250,
        currency: "gbp",
        payment_method: {
          type: "card",
          card: {
            number: "4444333322221111",
            expiry_month: 5,
            expiry_year: 2035,
            cvc: "123",
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe("GBP"); // toUpperCase
        expect(result.data.confirm).toBe(true); // default
        expect(result.data.capture_method).toBe("automatic"); // default
        expect(result.data.three_d_secure.enabled).toBe(true); // default
      }
    });

    it("should parse card_token payment", () => {
      const result = createPaymentIntentSchema.safeParse({
        amount: 1000,
        currency: "usd",
        payment_method: {
          type: "card_token",
          token: "pm_abc123def456",
        },
        three_d_secure: { enabled: false },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payment_method.type).toBe("card_token");
        expect(result.data.three_d_secure.enabled).toBe(false);
      }
    });

    it("should reject card payment without number", () => {
      const result = createPaymentIntentSchema.safeParse({
        amount: 250,
        currency: "gbp",
        payment_method: {
          type: "card",
          card: {
            expiry_month: 5,
            expiry_year: 2035,
            cvc: "123",
          },
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid currency length", () => {
      const result = createPaymentIntentSchema.safeParse({
        amount: 250,
        currency: "gbpp",
        payment_method: {
          type: "card",
          card: {
            number: "4444333322221111",
            expiry_month: 5,
            expiry_year: 2035,
            cvc: "123",
          },
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject zero amount", () => {
      const result = createPaymentIntentSchema.safeParse({
        amount: 0,
        currency: "gbp",
        payment_method: {
          type: "card",
          card: {
            number: "4444333322221111",
            expiry_month: 5,
            expiry_year: 2035,
            cvc: "123",
          },
        },
      });

      expect(result.success).toBe(false);
    });

    it("should parse with three_d_secure.return_url", () => {
      const result = createPaymentIntentSchema.safeParse({
        amount: 250,
        currency: "gbp",
        payment_method: {
          type: "card",
          card: {
            number: "4444333322221111",
            expiry_month: 5,
            expiry_year: 2035,
            cvc: "123",
          },
        },
        three_d_secure: {
          enabled: true,
          return_url: "https://myshop.com/checkout/complete",
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.three_d_secure.return_url).toBe(
          "https://myshop.com/checkout/complete"
        );
      }
    });

    it("should reject invalid return_url", () => {
      const result = createPaymentIntentSchema.safeParse({
        amount: 250,
        currency: "gbp",
        payment_method: {
          type: "card",
          card: {
            number: "4444333322221111",
            expiry_month: 5,
            expiry_year: 2035,
            cvc: "123",
          },
        },
        three_d_secure: {
          enabled: true,
          return_url: "not-a-url",
        },
      });

      expect(result.success).toBe(false);
    });

    it("should parse setup_future_usage off_session", () => {
      const result = createPaymentIntentSchema.safeParse({
        amount: 250,
        currency: "gbp",
        payment_method: {
          type: "card",
          card: {
            number: "4444333322221111",
            expiry_month: 5,
            expiry_year: 2035,
            cvc: "123",
          },
        },
        setup_future_usage: "off_session",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.setup_future_usage).toBe("off_session");
      }
    });

    it("should parse capture_method manual", () => {
      const result = createPaymentIntentSchema.safeParse({
        amount: 250,
        currency: "gbp",
        payment_method: {
          type: "card",
          card: {
            number: "4444333322221111",
            expiry_month: 5,
            expiry_year: 2035,
            cvc: "123",
          },
        },
        capture_method: "manual",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.capture_method).toBe("manual");
      }
    });
  });

  describe("deviceDataSubmitSchema", () => {
    it("should parse valid collection_reference", () => {
      const result = deviceDataSubmitSchema.safeParse({
        collection_reference: "0_4XYZ12345",
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty collection_reference", () => {
      const result = deviceDataSubmitSchema.safeParse({
        collection_reference: "",
      });
      expect(result.success).toBe(false);
    });

    it("should reject missing collection_reference", () => {
      const result = deviceDataSubmitSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
