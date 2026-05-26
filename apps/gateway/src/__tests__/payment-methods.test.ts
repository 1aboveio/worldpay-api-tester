/**
 * Integration tests for PaymentMethod API (Tokenization)
 *
 * Tests the POST /api/v1/payment_methods and GET /api/v1/payment_methods/{id} routes.
 * Mocks Worldpay HTTP client (external boundary). DAL is mocked via vitest alias.
 * Authentic encryption and ID generation are exercised.
 *
 * AC Mapping:
 *   AC1: POST valid card → 201 { id: "pm_xxx", card: { brand, last4, ... } }
 *   AC2: Response does not contain card number or token href
 *   AC3: Worldpay token href is AES-256 encrypted in DB
 *   AC4: GET /api/v1/payment_methods/{id} returns stored PaymentMethod
 *   AC5: GET /api/v1/payment_methods/{id} for non-existent id → 404
 *   AC6: Invalid card number → 400 { error.code: "invalid_card_number" }
 *   AC7: Expired card → 400 { error.code: "card_expired" }
 *   AC8: Idempotent: same card twice → same pm_xxx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/v1/payment_methods/route";
import { GET } from "@/app/api/v1/payment_methods/[id]/route";
import { resetMockStores } from "@repo/database";

// --- Mock Worldpay HTTP client (external system boundary) ---
vi.mock("@/lib/worldpay-client", () => ({
  worldpayRequest: vi.fn(),
}));

import { worldpayRequest } from "@/lib/worldpay-client";

const mockWorldpay = vi.mocked(worldpayRequest);

// --- Helpers ---
function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  apiKey = "sk_test_valid",
): NextRequest {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };

  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function buildWorldpayTokenResponse(
  tokenHref = "https://try.access.worldpay.com/tokens/tok_abc123",
  overrides?: Record<string, unknown>,
): Response {
  const body = {
    tokenHref,
    paymentInstrument: {
      brand: "visa",
      maskedCardNumber: "****1111",
      last4Digits: "1111",
      last4: "1111",
      fundingType: "credit",
      type: "credit",
      issuerCountryCode: "GB",
      expiryDate: {
        month: 12,
        year: 2030,
      },
    },
    ...overrides,
  };

  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}

function buildWorldpayErrorResponse(
  status: number,
  message: string,
  errorName?: string,
): Response {
  return new Response(
    JSON.stringify({
      errorName: errorName ?? "apiError",
      message,
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

const VALID_CARD = {
  type: "card" as const,
  card: {
    number: "4444333322221111",
    expiry_month: 12,
    expiry_year: 2030,
    cvc: "123",
    cardholder_name: "John Doe",
  },
};

// --- Reset mocks between tests ---
beforeEach(() => {
  vi.clearAllMocks();
  resetMockStores();
});

// =============================================================================
// AC1: POST valid card → 201 { id: "pm_xxx", card: { brand, last4, ... } }
// =============================================================================

describe("POST /api/v1/payment_methods — valid card", () => {
  it("returns 201 with pm_xxx id and masked card info", async () => {
    mockWorldpay.mockResolvedValueOnce(buildWorldpayTokenResponse());

    const req = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.object).toBe("payment_method");
    expect(body.type).toBe("card");
    expect(body.id).toMatch(/^pm_/);
    expect(body.card).toEqual({
      brand: "visa",
      last4: "1111",
      expiry_month: 12,
      expiry_year: 2030,
      funding: "credit",
      country: "GB",
    });
    expect(body.created).toBeDefined();
  });

  it("calls Worldpay Tokens v3 with correct media type", async () => {
    mockWorldpay.mockResolvedValueOnce(buildWorldpayTokenResponse());

    const req = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    await POST(req);

    expect(mockWorldpay).toHaveBeenCalledTimes(1);
    const callArgs = mockWorldpay.mock.calls[0][0];
    expect(callArgs.method).toBe("POST");
    expect(callArgs.path).toBe("/tokens");
    expect(callArgs.mediaType).toBe(
      "application/vnd.worldpay.tokens-v3.hal+json",
    );
  });
});

// =============================================================================
// AC2: Response does not contain card number or token href
// =============================================================================

describe("POST /api/v1/payment_methods — security: no sensitive data in response", () => {
  it("response never contains card number", async () => {
    mockWorldpay.mockResolvedValueOnce(buildWorldpayTokenResponse());

    const req = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const res = await POST(req);
    const body = await res.json();
    const responseStr = JSON.stringify(body);

    expect(responseStr).not.toContain("4444333322221111");
    expect(responseStr).not.toContain("4444");
    expect(body.card?.number).toBeUndefined();
  });

  it("response never contains Worldpay token href", async () => {
    const tokenHref = "https://try.access.worldpay.com/tokens/tok_secret_xyz";
    mockWorldpay.mockResolvedValueOnce(
      buildWorldpayTokenResponse(tokenHref),
    );

    const req = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const res = await POST(req);
    const body = await res.json();
    const responseStr = JSON.stringify(body);

    expect(responseStr).not.toContain("tok_secret_xyz");
    expect(responseStr).not.toContain("tokenHref");
    expect(responseStr).not.toContain("worldpayTokenHref");
    expect(body.token_href).toBeUndefined();
    expect(body.worldpay_token_href).toBeUndefined();
  });

  it("GET response also never contains token href", async () => {
    mockWorldpay.mockResolvedValueOnce(buildWorldpayTokenResponse());

    const postReq = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const postRes = await POST(postReq);
    const postBody = await postRes.json();

    const getReq = makeRequest(
      "GET",
      `/api/v1/payment_methods/${postBody.id}`,
    );
    const getRes = await GET(getReq, {
      params: Promise.resolve({ id: postBody.id }),
    });
    const getBody = await getRes.json();
    const getStr = JSON.stringify(getBody);

    expect(getStr).not.toContain("tokenHref");
    expect(getStr).not.toContain("worldpayTokenHref");
    expect(getStr).not.toContain("tok_");
    expect(getBody.worldpay_token_href).toBeUndefined();
  });
});

// =============================================================================
// AC3: Worldpay token href is AES-256 encrypted in DB
// =============================================================================

describe("POST /api/v1/payment_methods — token href encryption at rest", () => {
  it("token href stored by DAL is encrypted, not plaintext", async () => {
    const plainTokenHref =
      "https://try.access.worldpay.com/tokens/tok_real_123";
    mockWorldpay.mockResolvedValueOnce(
      buildWorldpayTokenResponse(plainTokenHref),
    );

    // Create with a second card to get a fresh record
    const { getTokenHref } = await import("@repo/dal");

    const res2 = await POST(
      makeRequest("POST", "/api/v1/payment_methods", {
        ...VALID_CARD,
        card: { ...VALID_CARD.card, number: "4111111111111111" },
      }),
    );
    const body2 = await res2.json();
    const stored = await getTokenHref(body2.id);

    // Must NOT be the plaintext
    expect(stored).not.toContain("tok_real");
    expect(stored).not.toBe(plainTokenHref);
    // Must be non-empty base64 (encrypted)
    expect(stored).toBeTruthy();
    expect(stored!.length).toBeGreaterThan(32);
  });

  it("can round-trip encrypt/decrypt", async () => {
    const { encrypt, decrypt } = await import("@/lib/encryption");
    const testData = "https://try.access.worldpay.com/tokens/tok_test_roundtrip";
    const encrypted = encrypt(testData);
    expect(encrypted).not.toBe(testData);
    expect(encrypted).not.toContain("tok_test_roundtrip");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(testData);
  });
});

// =============================================================================
// AC4: GET /api/v1/payment_methods/{id} returns stored PaymentMethod
// =============================================================================

describe("GET /api/v1/payment_methods/{id}", () => {
  it("returns stored masked card info", async () => {
    mockWorldpay.mockResolvedValueOnce(buildWorldpayTokenResponse());

    // Create first
    const postReq = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const postRes = await POST(postReq);
    const postBody = await postRes.json();

    // Then retrieve
    const getReq = makeRequest(
      "GET",
      `/api/v1/payment_methods/${postBody.id}`,
    );
    const getRes = await GET(getReq, {
      params: Promise.resolve({ id: postBody.id }),
    });
    const getBody = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(getBody.id).toBe(postBody.id);
    expect(getBody.object).toBe("payment_method");
    expect(getBody.type).toBe("card");
    expect(getBody.card.brand).toBe("visa");
    expect(getBody.card.last4).toBe("1111");
  });

  it("returns 200 with correct status field", async () => {
    mockWorldpay.mockResolvedValueOnce(buildWorldpayTokenResponse());

    const postReq = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const postRes = await POST(postReq);
    const postBody = await postRes.json();

    const getReq = makeRequest(
      "GET",
      `/api/v1/payment_methods/${postBody.id}`,
    );
    const getRes = await GET(getReq, {
      params: Promise.resolve({ id: postBody.id }),
    });
    const getBody = await getRes.json();

    expect(getBody.status).toBe("active");
  });
});

// =============================================================================
// AC5: GET /api/v1/payment_methods/{id} for non-existent id → 404
// =============================================================================

describe("GET /api/v1/payment_methods/{id} — not found", () => {
  it("returns 404 for non-existent id", async () => {
    const req = makeRequest(
      "GET",
      "/api/v1/payment_methods/pm_nonexistent",
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: "pm_nonexistent" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 for valid id belonging to different merchant", async () => {
    mockWorldpay.mockResolvedValueOnce(buildWorldpayTokenResponse());

    // Create as merchant_1
    const postReq = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const postRes = await POST(postReq);
    const postBody = await postRes.json();

    // Try to retrieve as merchant_2
    const getReq = makeRequest(
      "GET",
      `/api/v1/payment_methods/${postBody.id}`,
      undefined,
      "sk_test_merchant2",
    );
    const getRes = await GET(getReq, {
      params: Promise.resolve({ id: postBody.id }),
    });
    const getBody = await getRes.json();

    expect(getRes.status).toBe(404);
    expect(getBody.error.code).toBe("not_found");
  });
});

// =============================================================================
// AC6: Invalid card number → 400 { error.code: "invalid_card_number" }
// =============================================================================

describe("POST /api/v1/payment_methods — invalid card", () => {
  it("returns 400 with invalid_card_number when Worldpay rejects invalid card number", async () => {
    mockWorldpay.mockResolvedValueOnce(
      buildWorldpayErrorResponse(400, "Invalid card number", "cardNumberInvalid"),
    );

    const badCard = {
      type: "card" as const,
      card: { ...VALID_CARD.card, number: "4444333322221112" },
    };

    const req = makeRequest("POST", "/api/v1/payment_methods", badCard);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("invalid_card_number");
  });
});

// =============================================================================
// AC7: Expired card → 400 { error.code: "card_expired" }
// =============================================================================

describe("POST /api/v1/payment_methods — expired card", () => {
  it("returns 400 with card_expired when date is in the past", async () => {
    const expiredCard = {
      type: "card" as const,
      card: {
        ...VALID_CARD.card,
        number: "4444333322221111",
        expiry_month: 1,
        expiry_year: 2020,
      },
    };

    const req = makeRequest(
      "POST",
      "/api/v1/payment_methods",
      expiredCard,
    );
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("card_expired");
  });

  it("returns 400 when Worldpay says card expired", async () => {
    mockWorldpay.mockResolvedValueOnce(
      buildWorldpayErrorResponse(400, "Card has expired", "cardExpired"),
    );

    const futureCard = {
      type: "card" as const,
      card: {
        ...VALID_CARD.card,
        number: "4444333322221111",
        expiry_month: 12,
        expiry_year: 2030,
      },
    };

    const req = makeRequest("POST", "/api/v1/payment_methods", futureCard);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("card_expired");
  });
});

// =============================================================================
// AC8: Idempotency — same card twice returns same pm_xxx
// =============================================================================

describe("POST /api/v1/payment_methods — idempotency", () => {
  it("tokenizing same card twice returns same pm_xxx", async () => {
    const tokenHref = "https://try.access.worldpay.com/tokens/tok_same_card";

    mockWorldpay.mockResolvedValueOnce(
      buildWorldpayTokenResponse(tokenHref),
    );
    mockWorldpay.mockResolvedValueOnce(
      buildWorldpayTokenResponse(tokenHref),
    );

    // First call
    const req1 = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const res1 = await POST(req1);
    const body1 = await res1.json();
    expect(res1.status).toBe(201);

    // Second call with same card — returns 200 (idempotent)
    const req2 = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const res2 = await POST(req2);
    const body2 = await res2.json();
    expect(res2.status).toBe(200); // idempotent re-request

    // Same pm_xxx returned (idempotency via DAL mock)
    expect(body2.id).toBe(body1.id);
  });

  it("different cards get different pm_xxx", async () => {
    mockWorldpay.mockResolvedValueOnce(
      buildWorldpayTokenResponse(
        "https://try.access.worldpay.com/tokens/tok_card1",
      ),
    );
    mockWorldpay.mockResolvedValueOnce(
      buildWorldpayTokenResponse(
        "https://try.access.worldpay.com/tokens/tok_card2",
      ),
    );

    const card1 = {
      type: "card" as const,
      card: { ...VALID_CARD.card, number: "4444333322221111" },
    };
    const card2 = {
      type: "card" as const,
      card: { ...VALID_CARD.card, number: "5555444433332222" },
    };

    const r1 = await POST(
      makeRequest("POST", "/api/v1/payment_methods", card1),
    );
    const r2 = await POST(
      makeRequest("POST", "/api/v1/payment_methods", card2),
    );

    const b1 = await r1.json();
    const b2 = await r2.json();

    expect(b1.id).not.toBe(b2.id);
  });
});

// =============================================================================
// Auth edge cases
// =============================================================================

describe("Auth edge cases", () => {
  it("returns 401 when no Authorization header", async () => {
    const req = new NextRequest(
      "http://localhost/api/v1/payment_methods",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_CARD),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 for invalid API key", async () => {
    const req = makeRequest(
      "POST",
      "/api/v1/payment_methods",
      VALID_CARD,
      "sk_test_invalid",
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 for GET without Authorization header", async () => {
    const req = new NextRequest(
      "http://localhost/api/v1/payment_methods/pm_test",
      { method: "GET" },
    );

    const res = await GET(req, {
      params: Promise.resolve({ id: "pm_test" }),
    });
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// Validation edge cases
// =============================================================================

describe("Validation edge cases", () => {
  it("returns 400 for non-JSON body", async () => {
    const req = new NextRequest(
      "http://localhost/api/v1/payment_methods",
      {
        method: "POST",
        headers: {
          authorization: "Bearer sk_test_valid",
          "content-type": "application/json",
        },
        body: "not-json",
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when type is not 'card'", async () => {
    const req = makeRequest("POST", "/api/v1/payment_methods", {
      type: "bank_account",
      card: VALID_CARD.card,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when CVC is invalid", async () => {
    const req = makeRequest("POST", "/api/v1/payment_methods", {
      type: "card",
      card: { ...VALID_CARD.card, cvc: "12" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// Additional security: Worldpay client error → 502
// =============================================================================

describe("Gateway error handling", () => {
  it("returns 502 when Worldpay response is missing token href", async () => {
    // Return a response without tokenHref
    mockWorldpay.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: "ok" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    const req = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("returns 500 on unexpected errors during tokenization", async () => {
    mockWorldpay.mockRejectedValueOnce(new Error("Network failure"));

    const req = makeRequest("POST", "/api/v1/payment_methods", VALID_CARD);
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
