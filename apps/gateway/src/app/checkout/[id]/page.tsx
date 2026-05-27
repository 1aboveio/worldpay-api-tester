import { notFound } from "next/navigation"
import { getCheckoutSessionById } from "@repo/dal"
import { database } from "@repo/database"
import { CheckoutClient } from "./checkout-client"

function formatAmount(amountCents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100)
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`
  }
}

function TerminalState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-card p-8 text-center shadow-sm ring-1 ring-foreground/10">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cs = await getCheckoutSessionById(id)
  if (!cs) notFound()

  if (cs.status === "completed") {
    return <TerminalState title="Payment complete" message="This checkout has already been paid. Thank you!" />
  }
  if (cs.status === "expired" || cs.expiresAt.getTime() <= Date.now()) {
    return <TerminalState title="Checkout expired" message="This checkout link is no longer valid." />
  }
  if (cs.status === "processing") {
    return <TerminalState title="Payment in progress" message="This checkout is currently being processed." />
  }

  const merchant = await database.merchant.findUnique({
    where: { id: cs.merchantId },
    select: { name: true },
  })

  return (
    <CheckoutClient
      csId={cs.id}
      merchantName={merchant?.name ?? "Merchant"}
      amountLabel={formatAmount(cs.amount, cs.currency)}
      description={cs.description}
    />
  )
}
