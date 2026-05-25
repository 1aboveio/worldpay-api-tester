import { statementsQuerySchema } from "./schemas"
import type { WpCallFn, ResolveMerchantFn } from "./worldpay-types"

export interface StatementsServiceDeps {
  wpCall: WpCallFn
  resolveMerchant: ResolveMerchantFn
}

export async function handleGetStatements(
  query: Record<string, string>,
  apiKey: string,
  deps: StatementsServiceDeps,
) {
  // 1. Resolve merchant
  let merchant: Awaited<ReturnType<ResolveMerchantFn>>
  try {
    merchant = await deps.resolveMerchant(apiKey)
  } catch {
    return Response.json(
      { error: { code: "authentication_error", message: "Invalid API key" } },
      { status: 401 },
    )
  }

  // 2. Validate query params
  const parsed = statementsQuerySchema.safeParse(query)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: firstIssue?.message ?? "Invalid query",
          path: firstIssue?.path?.join("."),
        },
      },
      { status: 400 },
    )
  }

  const { from, to, page } = parsed.data

  // 3. Proxy to Worldpay
  try {
    const result = (await deps.wpCall(
      "/accounts/statements",
      "statements-2025-01-01",
      {
        method: "GET",
        body: undefined,
        queryParams: {
          startDate: from,
          endDate: to,
          pageNumber: String(page),
        },
      },
    )) as {
      items?: Array<{
        id?: string
        type?: string
        fundingType?: string
        amount?: number
        currency?: string
        balance?: number
        transactionReference?: string
        createdDate?: string
      }>
      hasMore?: boolean
    }

    const items = result.items ?? []
    const data = items.map((item) => ({
      id: item.id ?? "",
      type: item.type ?? "",
      funding_type: item.fundingType ?? "",
      amount: item.amount ?? 0,
      currency: item.currency ?? "",
      balance: item.balance ?? 0,
      transaction_reference: item.transactionReference ?? "",
      created: item.createdDate ?? "",
    }))

    return Response.json(
      {
        object: "list",
        data,
        has_more: result.hasMore ?? false,
      },
      { status: 200 },
    )
  } catch {
    return Response.json(
      {
        error: {
          code: "gateway_error",
          message: "Failed to fetch statements from Worldpay",
        },
      },
      { status: 502 },
    )
  }
}
