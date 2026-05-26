#!/bin/bash
set -e
cd /Users/exoulster/projects/worldpay-api-tester

# Clean up and reset to clean state
git checkout --force 2b0d305 2>/dev/null || true
rm -rf apps node_modules packages .turbo src tests .env.example .gitignore README.md package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json turbo.json vitest.config.ts REVIEW_CONTRACT.md 2>/dev/null || true
git reset --hard 2b0d305 2>/dev/null || true
git clean -fdx 2>/dev/null || true

echo "=== Clean state established ==="

# Extract all files directly from the commit object
mkdir -p packages/gateway-core/src packages/validators/src packages/worldpay-client/src \
  packages/dal/src/three-ds packages/dal/src/payment-intent packages/dal/prisma \
  apps/gateway/src/app/api/v1/payment_intents/\[id\]/device_data \
  apps/gateway/src/app/api/v1/3ds/callback apps/gateway/src/lib \
  tests/mocks tests/three-ds

for f in $(git ls-tree -r 2b0d305 --name-only); do
  mkdir -p "$(dirname "$f")"
  git show "2b0d305:$f" > "$f"
done

echo "=== All files extracted ==="
ls packages/gateway-core/src/index.ts && echo "gateway-core OK"
ls packages/validators/src/index.ts && echo "validators OK"

# =====================================================
# FIX 1: Add skipDdcInit to runThreeDSFlow
# =====================================================
echo "=== Applying Fix 1: skipDdcInit ==="

# Edit runThreeDSFlow - add skipDdcInit param
python3 -c "
import re
with open('packages/gateway-core/src/index.ts', 'r') as f:
    content = f.read()

# Add skipDdcInit to params interface within runThreeDSFlow
content = content.replace(
    '  gatewayBaseUrl: string;',
    '  gatewayBaseUrl: string;\n  skipDdcInit?: boolean;'
)

# Replace the entire DDC Init step (Step 1) to be conditional
old_ddc = '''  // Step 1: DDC Init
  const ddcResponse = await initDDC({
    worldpayClient,
    worldpayEntity,
    tokenHref,
    paymentIntentId,
  });
  const { url: ddcUrl, jwt: ddcJwt } =
    ddcResponse.deviceDataCollection;'''

new_ddc = '''  // Step 1: DDC Init (skip if already initialized)
  let ddcUrl = \"\";
  let ddcJwt = \"\";
  if (!params.skipDdcInit) {
    const ddcResponse = await initDDC({
      worldpayClient,
      worldpayEntity,
      tokenHref,
      paymentIntentId,
    });
    ddcUrl = ddcResponse.deviceDataCollection.url;
    ddcJwt = ddcResponse.deviceDataCollection.jwt;
  }'''

content = content.replace(old_ddc, new_ddc)

with open('packages/gateway-core/src/index.ts', 'w') as f:
    f.write(content)
print('Fix 1 applied')
"

# =====================================================
# FIX 2: Add accept_header and user_agent to deviceDataSubmitSchema
# =====================================================
echo "=== Applying Fix 2: deviceDataSubmitSchema headers ==="
python3 -c "
with open('packages/validators/src/index.ts', 'r') as f:
    content = f.read()

old_schema = '''export const deviceDataSubmitSchema = z.object({
  collection_reference: z.string().min(1, \"collection_reference is required\"),
});'''

new_schema = '''export const deviceDataSubmitSchema = z.object({
  collection_reference: z.string().min(1, \"collection_reference is required\"),
  accept_header: z.string().optional(),
  user_agent: z.string().optional(),
});'''

content = content.replace(old_schema, new_schema)
with open('packages/validators/src/index.ts', 'w') as f:
    f.write(content)
print('Fix 2 applied')
"

# Edit device_data route to extract and pass accept_header/user_agent
python3 -c "
with open('apps/gateway/src/app/api/v1/payment_intents/[id]/device_data/route.ts', 'r') as f:
    content = f.read()

# Extract accept_header and user_agent from parsed body
content = content.replace(
    \"const { collection_reference } = parsed.data;\",
    \"const { collection_reference, accept_header, user_agent } = parsed.data;\"
)

# Add skipDdcInit and acceptHeader/userAgentHeader to runThreeDSFlow call
content = content.replace(
    'gatewayBaseUrl: process.env.GATEWAY_BASE_URL ?? \"https://gateway.payfac.com\",',
    'gatewayBaseUrl: process.env.GATEWAY_BASE_URL ?? \"https://gateway.payfac.com\",\n      skipDdcInit: true,\n      acceptHeader: accept_header,\n      userAgentHeader: user_agent,'
)

with open('apps/gateway/src/app/api/v1/payment_intents/[id]/device_data/route.ts', 'w') as f:
    f.write(content)
print('Fix 2 route updated')
"

# =====================================================
# FIX 3: Pass captureMethod and setupFutureUsage in callback
# =====================================================
echo "=== Applying Fix 3: captureMethod/setupFutureUsage in callback ==="
python3 -c "
with open('packages/gateway-core/src/index.ts', 'r') as f:
    content = f.read()

# Add captureMethod and setupFutureUsage to handleChallengeCallback params
old_sig = '''  statementDescriptor?: string;
  riskProfileHref?: string;
}): Promise<{
  redirectUrl: string;
}> {'''

new_sig = '''  statementDescriptor?: string;
  riskProfileHref?: string;
  captureMethod?: string;
  setupFutureUsage?: string;
}): Promise<{
  redirectUrl: string;
}> {'''

content = content.replace(old_sig, new_sig)

# Update destructuring in handleChallengeCallback
old_dest = '''    statementDescriptor,
    riskProfileHref,
  } = params;'''

new_dest = '''    statementDescriptor,
    riskProfileHref,
    captureMethod,
    setupFutureUsage,
  } = params;'''

content = content.replace(old_dest, new_dest)

# Update authorizeWithThreeDS call in handleChallengeCallback
old_auth = '''    statementDescriptor,
    riskProfileHref,
  });'''

new_auth = '''    statementDescriptor,
    riskProfileHref,
    captureMethod,
    setupFutureUsage,
  });'''

content = content.replace(old_auth, new_auth)

with open('packages/gateway-core/src/index.ts', 'w') as f:
    f.write(content)
print('Fix 3 applied')
"

# Edit callback route to pass captureMethod and setupFutureUsage
python3 -c "
with open('apps/gateway/src/app/api/v1/3ds/callback/route.ts', 'r') as f:
    content = f.read()

# Add captureMethod and setupFutureUsage to handleChallengeCallback call
old_cb = '''      riskProfileHref: pi.riskProfileHref ?? undefined,
    });'''

new_cb = '''      riskProfileHref: pi.riskProfileHref ?? undefined,
      captureMethod: pi.captureMethod,
      setupFutureUsage: pi.setupFutureUsage ?? undefined,
    });'''

content = content.replace(old_cb, new_cb)

with open('apps/gateway/src/app/api/v1/3ds/callback/route.ts', 'w') as f:
    f.write(content)
print('Fix 3 route updated')
"

# =====================================================
# FIX 4: Add session expiry check in verify3DS
# FIX 6: Add replay protection (status check) in verify3DS
# =====================================================
echo "=== Applying Fix 4 (expiry) & Fix 6 (replay protection) ==="
python3 -c "
with open('packages/dal/src/three-ds/verify.ts', 'r') as f:
    content = f.read()

# Add session expiry and status checks after finding the session
old_check = '''  if (!session || !session.challengeReference) {
    return {
      outcome: \"failed\",
      error: \"Session not found or missing challenge reference\",
    };
  }'''

new_check = '''  if (!session || !session.challengeReference) {
    return {
      outcome: \"failed\",
      error: \"Session not found or missing challenge reference\",
    };
  }

  // Replay protection: only process sessions in challenged state
  if (session.status === \"completed\") {
    return {
      outcome: \"failed\",
      error: \"Session already completed — replay rejected\",
    };
  }

  // Session expiry: 15-minute TTL from creation
  const TTL_MS = 15 * 60 * 1000;
  if (Date.now() - session.createdAt.getTime() > TTL_MS) {
    return {
      outcome: \"failed\",
      error: \"Session expired\",
    };
  }'''

content = content.replace(old_check, new_check)

# Update session status to completed after successful verification
old_update = '''  // Update session status
  await prisma.threeDSSession.update({
    where: { id: sessionId },
    data: { status: response.outcome },
  });'''

new_update = '''  // Update session status — mark as completed to prevent replay
  await prisma.threeDSSession.update({
    where: { id: sessionId },
    data: { status: \"completed\" },
  });'''

content = content.replace(old_update, new_update)

with open('packages/dal/src/three-ds/verify.ts', 'w') as f:
    f.write(content)
print('Fixes 4 & 6 applied')
"

# =====================================================
# FIX 5: Fix 3DS-disabled type hack
# =====================================================
echo "=== Applying Fix 5: 3DS-disabled type hack ==="
python3 -c "
with open('packages/gateway-core/src/index.ts', 'r') as f:
    content = f.read()

# Extend threeDSStatus type to include not_requested
old_type = \"  threeDSStatus: \\\"authenticated\\\" | \\\"not_enrolled\\\" | \\\"unavailable\\\";\"
new_type = \"  threeDSStatus: \\\"authenticated\\\" | \\\"not_enrolled\\\" | \\\"unavailable\\\" | \\\"not_requested\\\";\"
content = content.replace(old_type, new_type)

# When threeDSStatus is not_requested, skip 3DS field storage
# Update storePaymentResult in the success case
old_success = '''    await storePaymentResult(paymentIntentId, {
      status: \"succeeded\",
      worldpayPaymentId: citResponse.paymentId,
      schemeReference: citResponse.scheme?.reference,
      issuerAuthCode: citResponse.issuer?.authorizationCode,
      threeDSStatus,
      ...(threeDS && {
        threeDSVersion: threeDS.version,
        threeDSEci: threeDS.eci,
        threeDSAuthValue: threeDS.authenticationValue,
        threeDSTransactionId: threeDS.transactionId,
      }),
    });'''

new_success = '''    await storePaymentResult(paymentIntentId, {
      status: \"succeeded\",
      worldpayPaymentId: citResponse.paymentId,
      schemeReference: citResponse.scheme?.reference,
      issuerAuthCode: citResponse.issuer?.authorizationCode,
      ...(threeDSStatus !== \"not_requested\" && { threeDSStatus }),
      ...(threeDS && threeDSStatus !== \"not_requested\" && {
        threeDSVersion: threeDS.version,
        threeDSEci: threeDS.eci,
        threeDSAuthValue: threeDS.authenticationValue,
        threeDSTransactionId: threeDS.transactionId,
      }),
    });'''

content = content.replace(old_success, new_success)

# Update storePaymentResult in the failure case
old_fail = '''    await storePaymentResult(paymentIntentId, {
      status: \"payment_failed\",
      failureCode: citResponse.refusalCode ?? \"refused\",
      failureMessage: citResponse.refusalDescription,
      threeDSStatus,
      ...(threeDS && {
        threeDSVersion: threeDS.version,
        threeDSEci: threeDS.eci,
        threeDSAuthValue: threeDS.authenticationValue,
      }),
    });'''

new_fail = '''    await storePaymentResult(paymentIntentId, {
      status: \"payment_failed\",
      failureCode: citResponse.refusalCode ?? \"refused\",
      failureMessage: citResponse.refusalDescription,
      ...(threeDSStatus !== \"not_requested\" && { threeDSStatus }),
      ...(threeDS && threeDSStatus !== \"not_requested\" && {
        threeDSVersion: threeDS.version,
        threeDSEci: threeDS.eci,
        threeDSAuthValue: threeDS.authenticationValue,
      }),
    });'''

content = content.replace(old_fail, new_fail)

with open('packages/gateway-core/src/index.ts', 'w') as f:
    f.write(content)
print('Fix 5 applied')
"

# Fix the payment_intents route to remove the hack
python3 -c "
with open('apps/gateway/src/app/api/v1/payment_intents/route.ts', 'r') as f:
    content = f.read()

# Change threeDSStatus from 'authenticated' to 'not_requested'
content = content.replace(
    'threeDSStatus: \"authenticated\", // not_requested in real flow',
    'threeDSStatus: \"not_requested\",'
)

# Remove the overwrite hack
old_overwrite = '''
      // Override threeDS status for disabled path
      await updatePaymentIntentStatus(paymentIntent.id, result.status, {
        threeDSStatus: \"not_requested\",
      });'''
content = content.replace(old_overwrite, '')

with open('apps/gateway/src/app/api/v1/payment_intents/route.ts', 'w') as f:
    f.write(content)
print('Fix 5 route updated')
"

echo "=== All fixes applied ==="
