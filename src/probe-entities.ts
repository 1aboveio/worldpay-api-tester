/**
 * Worldpay Access — Entity Auto-Discovery
 *
 * 遍历给定的 entity 列表，自动找到配置了 Card Payments 的 entity
 */

const ENTITIES = [
];

const CONFIG = {
  baseUrl: process.env.WORLDPAY_BASE_URL ?? "https://try.access.worldpay.com",
  username: process.env.WORLDPAY_USERNAME ?? "",
  password: process.env.WORLDPAY_PASSWORD ?? "",
  mediaType: "application/vnd.worldpay.payments-v7+json",
};

function authHeader(): string {
  const encoded = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString("base64");
  return `Basic ${encoded}`;
}

function generateRef(): string {
  return `entity-probe-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

const PAYLOAD = (entity: string) => ({
  transactionReference: generateRef(),
  merchant: { entity },
  instruction: {
    requestAutoSettlement: { enabled: false },
    narrative: { line1: "Entity-Probe" },
    value: { currency: "GBP", amount: 250 },
    paymentInstrument: {
      type: "card/plain",
      cardNumber: "4444333322221111",
      cardHolderName: "Test Cardholder",
      expiryDate: { month: 5, year: 2035 },
      cvc: "123",
      billingAddress: {
        address1: "1 Test Street",
        city: "London",
        postalCode: "SW1A 1AA",
        countryCode: "GB",
      },
    },
  },
  channel: "ecom",
});

async function probeEntity(entity: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${CONFIG.baseUrl}/cardPayments/customerInitiatedTransactions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": CONFIG.mediaType,
      Accept: CONFIG.mediaType,
    },
    body: JSON.stringify(PAYLOAD(entity)),
  });
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  console.log(`🔍 探测 ${ENTITIES.length} 个 entity 中...\n`);

  const working: string[] = [];
  const errors: Record<string, string> = {};

  for (const entity of ENTITIES) {
    const { ok, status, body } = await probeEntity(entity);
    const err = (body as Record<string, unknown>)?.errorName as string | undefined;

    if (ok && status === 201) {
      const outcome = (body as Record<string, unknown>)?.outcome;
      console.log(`  ✅ ${entity}  → HTTP ${status}  outcome=${outcome}  ← 可用!`);
      working.push(entity);
    } else if (err === "entityIsNotConfigured") {
      console.log(`  ⛔ ${entity}  → 未配置 Card Payments`);
      errors[entity] = "未配置";
    } else {
      console.log(`  ❌ ${entity}  → HTTP ${status}  ${err ?? "unknown"}`);
      errors[entity] = `HTTP ${status} ${err ?? ""}`;
    }
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  结果汇总");
  console.log("═══════════════════════════════════════════════");
  console.log(`  可用 entity:    ${working.length > 0 ? working.join(", ") : "无"}`);
  console.log(`  未配置:         ${Object.values(errors).filter(e => e === "未配置").length} 个`);
  console.log(`  其他错误:       ${Object.values(errors).filter(e => e !== "未配置").length} 个`);

  if (working.length > 0) {
    console.log(`\n💡 请在 .env 中设置: WORLDPAY_ENTITY=${working[0]}`);
  } else {
    console.log("\n⚠️  没有找到可用的 entity。请检查:");
    console.log("   1. 凭证是否正确");
    console.log("   2. entity 列表是否完整");
    console.log("   3. 联系 Worldpay Implementation Manager 确认 entity 配置");
  }
  console.log();
}

main().catch(console.error);
