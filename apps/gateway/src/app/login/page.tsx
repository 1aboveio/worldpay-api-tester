"use client"

import { useActionState } from "react"
import { loginAction } from "@/app/(portal)/auth-actions"
import type { ActionResult } from "@/app/(portal)/auth-actions"

const initialState: ActionResult = { success: false }

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">PayFac Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your account
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="admin@fmmpay.com"
            />
            {state.error?.fieldErrors?.email && (
              <p className="text-sm text-destructive">{state.error.fieldErrors.email[0]}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="••••••••"
            />
            {state.error?.fieldErrors?.password && (
              <p className="text-sm text-destructive">{state.error.fieldErrors.password[0]}</p>
            )}
          </div>

          {state.error && !state.error.fieldErrors && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.error.message}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/portal/register" className="font-medium text-primary underline underline-offset-4 hover:text-primary/90">
            Register
          </a>
        </p>
      </div>
    </div>
  )
}
