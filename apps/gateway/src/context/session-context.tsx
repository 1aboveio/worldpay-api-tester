"use client"

import { createContext, useContext, ReactNode, use } from "react"
import type { getSession } from "@/lib/auth-server"

type EnrichedSession = Awaited<ReturnType<typeof getSession>>

const SessionContext = createContext<EnrichedSession | null>(null)

export function SessionProvider({
  children,
  sessionPromise,
}: {
  children: ReactNode
  sessionPromise: Promise<EnrichedSession>
}) {
  const session = use(sessionPromise)

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)
  if (context === undefined) {
    throw new Error("useSession must be used within SessionProvider")
  }
  return context
}
