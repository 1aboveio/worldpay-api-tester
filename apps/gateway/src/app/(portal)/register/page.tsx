"use client"

import { useActionState } from "react"
import { registerAction } from "@/app/(portal)/auth-actions"
import type { ActionResult } from "@/app/(portal)/auth-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"

const initialState: ActionResult = { success: false }

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, initialState)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Create Account</CardTitle>
          <CardDescription>Register for the PayFac Portal</CardDescription>
        </CardHeader>

        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2" data-invalid={!!state.error?.fieldErrors?.name || undefined}>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                placeholder="John Doe"
                aria-invalid={!!state.error?.fieldErrors?.name || undefined}
              />
              {state.error?.fieldErrors?.name && (
                <p className="text-sm text-destructive">{state.error.fieldErrors.name[0]}</p>
              )}
            </div>

            <div className="flex flex-col gap-2" data-invalid={!!state.error?.fieldErrors?.email || undefined}>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="admin@fmmpay.com"
                aria-invalid={!!state.error?.fieldErrors?.email || undefined}
              />
              {state.error?.fieldErrors?.email && (
                <p className="text-sm text-destructive">{state.error.fieldErrors.email[0]}</p>
              )}
              <p className="text-xs text-muted-foreground">
                @fmmpay.com emails get platform admin access
              </p>
            </div>

            <div className="flex flex-col gap-2" data-invalid={!!state.error?.fieldErrors?.password || undefined}>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                placeholder="••••••••"
                aria-invalid={!!state.error?.fieldErrors?.password || undefined}
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

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-primary underline underline-offset-4 hover:text-primary/90">
              Sign in
            </a>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
