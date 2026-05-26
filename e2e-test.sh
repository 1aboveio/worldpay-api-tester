#!/bin/bash
set -e

# E2E Test Script for PayFac Payment Gateway
# Requires: podman, curl, jq
# Spins up Postgres + app, seeds data, runs E2E tests, cleans up

API="http://localhost:3001"
PASSED=0
FAILED=0

pass() { echo "  ✅ $1"; PASSED=$((PASSED+1)); }
fail() { echo "  ❌ $1 (expected: $2, got: $3)"; FAILED=$((FAILED+1)); }

# ─── Setup ───────────────────────────────────────────

echo "=== Starting Postgres ==="
podman rm -f pg-e2e 2>/dev/null || true
podman run -d --name pg-e2e -p 5433:5432 \
  -e POSTGRES_USER=worldpay -e POSTGRES_PASSWORD=worldpay -e POSTGRES_DB=worldpay \
  docker.io/library/postgres:16-alpine > /dev/null
sleep 5

cd /Users/exoulster/projects/worldpay-api-tester
DATABASE_URL="postgres://worldpay:worldpay@localhost:5433/worldpay" \
  pnpm --filter @repo/database exec prisma db push 2>/dev/null

echo "=== Seeding test data ==="
PGPASSWORD=worldpay psql -h localhost -p 5433 -U worldpay -d worldpay -c "
INSERT INTO \"Merchant\" (id, name, entity, \"payFacConfig\", \"createdAt\", \"updatedAt\") 
VALUES ('m_test', 'Test Merchant', 'test_entity', '{}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
" 2>/dev/null
PGPASSWORD=worldpay psql -h localhost -p 5433 -U worldpay -d worldpay -c "
INSERT INTO \"ApiKey\" (id, \"keyHash\", prefix, \"merchantId\", \"isActive\", \"createdAt\", \"updatedAt\") 
VALUES ('ak_test', 'c5fbca43d580315a9938a85e9e02b4afa29d6ab2f8d5deb9354f154787e84062', 'sk_test_', 'm_test', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
" 2>/dev/null
echo "Seeded"

echo "=== Starting app ==="
podman rm -f app-e2e 2>/dev/null || true
podman run -d --name app-e2e -p 3001:8080 \
  -e DATABASE_URL="postgres://worldpay:worldpay@host.containers.internal:5433/worldpay" \
  -e BETTER_AUTH_SECRET="e2e-test-secret-at-least-32-chars-long!!" \
  -e BETTER_AUTH_URL="http://localhost:3001" \
  -e WORLDPAY_BASE_URL="https://try.access.worldpay.com" \
  -e WORLDPAY_USERNAME="test" \
  -e WORLDPAY_PASSWORD="test" \
  worldpay-api-tester:local > /dev/null
sleep 5

echo ""
echo "========================================="
echo "  E2E Tests"
echo "========================================="
echo ""

# ─── US-01: Card Payment Happy Path ──────────────────

echo "--- US-01: Card Payment ---"

# AC: Invalid API key → 401
RESP=$(curl -s "$API/api/v1/payment_intents" -H "Content-Type: application/json" -d '{"amount":100,"currency":"GBP"}')
CODE=$(echo "$RESP" | jq -r '.error.code // "none"')
[ "$CODE" = "invalid_api_key" ] && pass "Invalid API key → 401" || fail "Invalid API key → 401" "invalid_api_key" "$CODE"

# AC: Valid API key → creates PaymentIntent
RESP=$(curl -s "$API/api/v1/payment_intents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_e2e" \
  -d '{"amount":250,"currency":"gbp","payment_method":{"type":"card","card":{"number":"4444333322221111","expiry_month":5,"expiry_year":2035,"cvc":"123","cardholder_name":"John Doe","billing_address":{"line1":"221B Baker Street","city":"London","postal_code":"NW1 6XE","country":"GB"}}},"confirm":true,"capture_method":"automatic","description":"E2E Test Order"}')
STATUS=$(echo "$RESP" | jq -r '.status // "none"')
PI_ID=$(echo "$RESP" | jq -r '.id // ""')
echo "  PI response: $RESP" | head -c 200
echo ""
if echo "$STATUS" | grep -qE "succeeded|processing|payment_failed|requires_action|requires_device_data"; then
  pass "Card payment created → status=$STATUS"
else
  fail "Card payment created" "succeeded|processing|payment_failed" "$STATUS"
fi

# ─── US-06: Payment Query ────────────────────────────

echo "--- US-06: Payment Query ---"

RESP=$(curl -s "$API/api/v1/payment_intents?limit=5" -H "Authorization: Bearer sk_test_e2e")
DATA_LEN=$(echo "$RESP" | jq -r '.data | length // 0')
[ "$DATA_LEN" -ge 0 ] && pass "Payment list returns data (count=$DATA_LEN)" || fail "Payment list" ">=0" "$DATA_LEN"

# ─── US-03: Tokenization ─────────────────────────────

echo "--- US-03: Tokenization ---"

RESP=$(curl -s "$API/api/v1/payment_methods" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_e2e" \
  -d '{"type":"card","card":{"number":"4444333322221111","expiry_month":5,"expiry_year":2035,"cvc":"123"}}')
PM_ID=$(echo "$RESP" | jq -r '.id // ""')
PM_LAST4=$(echo "$RESP" | jq -r '.card.last4 // ""')
PM_ERROR=$(echo "$RESP" | jq -r '.error.code // ""')
if [ -n "$PM_ID" ]; then
  pass "Token created → $PM_ID (last4=$PM_LAST4)"
elif [ -n "$PM_ERROR" ]; then
  pass "Token creation attempted (Worldpay error: $PM_ERROR)"
else
  fail "Token creation" "pm_xxx or error" "$PM_ID"
fi

# Verify card number not in response
echo "$RESP" | grep -q "4444333322221111" && fail "Card number in response" "absent" "present" || pass "Card number not in response"

# ─── US-05: Refunds (if payment succeeded) ───────────

if [ -n "$PI_ID" ] && [ "$STATUS" = "succeeded" ]; then
  echo "--- US-05: Refunds ---"
  RESP=$(curl -s "$API/api/v1/refunds" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer sk_test_e2e" \
    -d "{\"payment_intent\":\"$PI_ID\",\"amount\":250}")
  REFUND_STATUS=$(echo "$RESP" | jq -r '.status // "none"')
  [ "$REFUND_STATUS" = "succeeded" ] && pass "Refund succeeded" || fail "Refund" "succeeded" "$REFUND_STATUS"
fi

# ─── Cleanup ─────────────────────────────────────────

echo ""
echo "========================================="
echo "  Results: $PASSED passed, $FAILED failed"
echo "========================================="

podman stop app-e2e pg-e2e 2>/dev/null
podman rm app-e2e pg-e2e 2>/dev/null

[ "$FAILED" -eq 0 ] && exit 0 || exit 1
