#!/bin/bash
set -e
cd /Users/exoulster/projects/worldpay-api-tester

# Ensure we're on the right branch
git reset --hard 35c94e7
git checkout -B feat/10-admin-portal-fixes 35c94e7 2>/dev/null || true

# Create dirs
mkdir -p apps/gateway/src/components/ui
mkdir -p "apps/gateway/src/app/(portal)/__tests__"

# ─── UI Components ───
node -e "
const fs = require('fs');
fs.writeFileSync('apps/gateway/src/components/ui/field-group.tsx', \`
import type { ReactNode } from \"react\"

export function FieldGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={\`flex flex-col gap-1.5 \${className ?? \"\"}\`}>
      {children}
    </div>
  )
}

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  children: ReactNode
}) {
  return (
    <FieldGroup>
      <label htmlFor={htmlFor} className=\"text-sm font-medium\">
        {label}
      </label>
      {children}
      {error && <p className=\"text-sm text-destructive\">{error}</p>}
    </FieldGroup>
  )
}
\`);

fs.writeFileSync('apps/gateway/src/components/ui/badge.tsx', \`
import type { ReactNode } from \"react\"

type BadgeVariant = \"default\" | \"success\" | \"destructive\" | \"warning\" | \"outline\"

const variantClasses: Record<BadgeVariant, string> = {
  default: \"bg-muted text-muted-foreground\",
  success: \"bg-emerald-100 text-emerald-700\",
  destructive: \"bg-red-100 text-red-700\",
  warning: \"bg-amber-100 text-amber-700\",
  outline: \"border border-input bg-background text-muted-foreground\",
}

export function Badge({
  children,
  variant = \"default\",
  className,
}: {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span
      className={\`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium \${variantClasses[variant]} \${className ?? \"\"}\`}
    >
      {children}
    </span>
  )
}
\`);
console.log('UI components written');
"
echo "UI components done"

# ─── Fix all source files using node scripts ───
node -e "
const fs = require('fs');
const path = require('path');

// Helper to write file
function w(p, content) { fs.writeFileSync(p, content); console.log('Wrote', p); }

// ── Fix 1: Mock DB with auditLog ──
const mockDb = fs.readFileSync('apps/gateway/src/__mocks__/database.ts', 'utf8');

// Add auditLogs to store type and initialization
let updated = mockDb.replace(
  /statements: Map<string, Record<string, unknown>>\n\} = \{/,
  'statements: Map<string, Record<string, unknown>>\n  auditLogs: Map<string, Record<string, unknown>>\n} = {'
);
updated = updated.replace(
  /statements: new Map\(\),\n\}/,
  'statements: new Map(),\n  auditLogs: new Map(),\n}'
);

// Add auditLog clear
updated = updated.replace(
  /store\.statements\.clear\(\)\n\}/,
  'store.statements.clear()\n  store.auditLogs.clear()\n}'
);

// Add seedAuditLog after seedStatement
updated = updated.replace(
  /export function seedStatement[\s\S]*?return id\n\}/,
  (match) => match + '\n\nexport function seedAuditLog(data: Record<string, unknown>): string {\n  const id = (data.id as string) || makeId()\n  store.auditLogs.set(id, { ...data, id, userId: data.userId, merchantId: data.merchantId ?? null, action: data.action, timestamp: new Date(), details: data.details ?? null })\n  return id\n}\n'
);

// Add auditLog to database object before closing
updated = updated.replace(
  /  },\n\}\n$/,
  '  },\n  auditLog: {\n    create: async ({ data }: { data: Record<string, unknown> }) => {\n      const id = (data.id as string) || makeId()\n      const record = { ...data, id, timestamp: new Date() }\n      store.auditLogs.set(id, record)\n      return record\n    },\n    findMany: async (opts?: { where?: Record<string, unknown>; orderBy?: Record<string, string> }) => {\n      let results = Array.from(store.auditLogs.values())\n      if (opts?.where) {\n        const w = opts.where\n        if (w.userId !== undefined) results = results.filter((l: Record<string, unknown>) => l.userId === w.userId)\n        if (w.action !== undefined) results = results.filter((l: Record<string, unknown>) => l.action === w.action)\n        if (w.merchantId !== undefined) results = results.filter((l: Record<string, unknown>) => l.merchantId === w.merchantId)\n      }\n      if (opts?.orderBy?.timestamp === \"desc\") {\n        results.sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.timestamp as Date)?.getTime() ?? 0) - ((a.timestamp as Date)?.getTime() ?? 0))\n      }\n      return results\n    },\n  },\n}\n'
);

// Also add refund.create
updated = updated.replace(
  /count: async.*?return results\.length\n    \},\n  \},\n  statement:/,
  (match) => match.replace(
    'count: async',
    'create: async ({ data }: { data: Record<string, unknown> }) => {\n      const id = (data.id as string) || makeId()\n      const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() }\n      store.refunds.set(id, record)\n      return record\n    },\n    count: async'
  )
);

w('apps/gateway/src/__mocks__/database.ts', updated);
" 2>&1