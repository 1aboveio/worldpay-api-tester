import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, resolveMerchantFromApiKey } from "@/lib/auth";
import { getPaymentMethodById } from "@repo/dal";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // --- Auth ---
    const token = extractBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json(
        { error: { code: "invalid_api_key", message: "Missing or invalid Authorization header" } },
        { status: 401 },
      );
    }

    const auth = await resolveMerchantFromApiKey(token);
    if (!auth) {
      return NextResponse.json(
        { error: { code: "invalid_api_key", message: "Invalid API key" } },
        { status: 401 },
      );
    }

    const { id } = await params;

    // --- Look up PaymentMethod ---
    const pm = await getPaymentMethodById(id);

    // 404 if not found
    if (!pm) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Payment method not found" } },
        { status: 404 },
      );
    }

    // 404 if belongs to a different merchant (security)
    if (pm.merchantId !== auth.merchantId) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Payment method not found" } },
        { status: 404 },
      );
    }

    // Return masked info only — never the token href
    return NextResponse.json({
      id: pm.id,
      object: "payment_method",
      type: "card",
      card: {
        brand: pm.brand,
        last4: pm.last4,
        expiry_month: pm.expiryMonth,
        expiry_year: pm.expiryYear,
        funding: pm.funding,
        country: pm.country,
      },
      status: pm.status,
      created: pm.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("GET /v1/payment_methods/[id] error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: { code: "internal_error", message: "An internal error occurred" } },
      { status: 500 },
    );
  }
}
