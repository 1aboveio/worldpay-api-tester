import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const registerSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
})

export type ActionResult<T = unknown> = {
  success: boolean
  data?: T
  error?: { code: string; message: string; fieldErrors?: Record<string, string[]> }
}

export function isAllowedEmail(email: string): boolean {
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || "fmmpay.com"
  return email.toLowerCase().endsWith(`@${allowedDomain}`)
}
