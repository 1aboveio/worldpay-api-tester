import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { authMiddleware, resolveMerchant } from "@/lib/middleware"

// ---- Zod schema -----------------------------------------------------------

const paymentIntentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  token: z.string().min(1).max(256).optional(),
  cardNumber: z.string().min(12).max(19).optional(),
  expiryMonth: z.number().int().min(1).max(12).optional(),
  expiryYear: z.number().int().min(2025).max(2099).optional(),
  cvc: z.string().min(3).max(4).optional(),
  merchantReference: z.string().max(256).optional(),
})

export type PaymentIntentInput = z.infer<typeof paymentIntentSchema>

// ---- Error helper ---------------------------------------------------------

function errorResponse(
  code: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

// ---- Handler --------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- 1. Auth middleware ---
  const authResult = await authMiddleware(request)
  if (authResult instanceof NextResponse) return authResult

  // --- 2. Resolve merchant from the pre-resolved API key record ---
  const merchant = resolveMerchant(authResult)
  if (!merchant) {
    return errorResponse("invalid_api_key", "Could not resolve merchant", 401)
  }

  // --- 3. Parse and validate body ---
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("invalid_request", "Request body must be valid JSON", 400)
  }

  const parsed = paymentIntentSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return errorResponse(
      "validation_error",
      firstIssue?.message ?? "Invalid request body",
      400
    )
  }

  const input = parsed.data

  // --- 4. Return resolved merchant + parsed input (token creation deferred to later ACs) ---
  return NextResponse.json({
    merchant: {
      id: merchant.id,
      name: merchant.name,
      worldpayEntity: merchant.worldpayEntity,
      status: merchant.status,
    },
    paymentIntent: {
      amount: input.amount,
      currency: input.currency,
      token: input.token ?? null,
      merchantReference: input.merchantReference ?? null,
    },
  })
}
