import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-server"
import { SessionProvider } from "@/context/session-context"
import { PortalSidebar } from "./components/portal-sidebar"

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  // Auth guard: no session → login
  if (!session) {
    redirect("/portal/login")
  }

  // No merchants assigned → error state
  if (session.availableMerchants.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-xl font-bold">No Merchant Access</h1>
          <p className="mt-2 text-muted-foreground">
            Your account is not associated with any merchants. Please contact support.
          </p>
        </div>
      </div>
    )
  }

  const sessionPromise = Promise.resolve(session)

  return (
    <SessionProvider sessionPromise={sessionPromise}>
      <div className="flex min-h-screen bg-background">
        <PortalSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </SessionProvider>
  )
}
