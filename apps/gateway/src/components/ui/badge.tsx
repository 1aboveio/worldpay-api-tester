import type { ReactNode } from "react"

type BadgeVariant = "default" | "success" | "destructive" | "warning" | "outline"

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-emerald-100 text-emerald-700",
  destructive: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  outline: "border border-input bg-background text-muted-foreground",
}

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className ?? ""}`}
    >
      {children}
    </span>
  )
}
