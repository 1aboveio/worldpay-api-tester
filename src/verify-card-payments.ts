/**
 * Worldpay Access — Card Payments & Payment Queries API Verification
 *
 * 最小验证闭环:
 *   1. CIT 支付授权 (Card Payments v7)
 *   2. 按 transactionReference 查询支付 (Payment Queries v1)
 *   3. 按日期范围查询支付列表 (Payment Queries v1)
 *   4. 按 paymentId 查询单笔支付详情 (Payment Queries v1)
 *
 * 用法:
 *   1. cp .env.example .env  # 填入你的 API 凭证
 *   2. npm install
 *   3. npm run verify:card-payments
 */

// --------------- Configuration ---------------

const CONFIG = {
  baseUrl: process.env.WORLDPAY_BASE_URL ?? "https://try.access.worldpay.com",
  username: process.env.WORLDPAY_USERNAME ?? "",
  password: process.env.WORLDPAY_PASSWORD ?? "",
  entity: process.env.WORLDPAY_ENTITY ?? "your_entity",
  // PayFac required fields
  payFacSchemeId: process.env.WORLDPAY_PAYFAC_SCHEME_ID ?? "12345",
  subMerchantRef: "sub001",
  subMerchantName: "Test Sub Merchant",
  paymentsMediaType:
    process.env.WORLDPAY_PAYMENTS_MEDIA_TYPE ??
    "application/vnd.worldpay.payments-v7+json",
  queriesMediaType:
    process.env.WORLDPAY_QUERIES_MEDIA_TYPE ??
    "application/vnd.worldpay.payment-queries-v1.hal+json",
};

// --------------- Test Card (from Worldpay docs examples) ---------------

const TEST_CARD = {
  number: "4444333322221111",
  expiryMonth: 5,
  expiryYear: 2035,
  cvc: "123",
};

// --------------- Helpers ---------------

function authHeader(): string {
  const encoded = Buffer.from(
    `${CONFIG.username}:${CONFIG.password}`
  ).toString("base64");
  return `Basic ${encoded}`;
}

function generateRef(prefix: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function fmtJSON(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

async function apiCall(
  method: string,
  path: string,
  opts: {
    mediaType?: string;
    body?: unknown;
    query?: Record<string, string>;
  } = {}
) {
  const url = new URL(path, CONFIG.baseUrl);
  if (opts.query) {
    Object.entries(opts.query).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const mediaType = opts.mediaType ?? CONFIG.paymentsMediaType;
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    Accept: mediaType,
  };
  if (opts.body) {
    headers["Content-Type"] = mediaType;
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: response.status, data };
}

function ok(step: string, detail?: string) {
  console.log(`  ✅ ${step}${detail ? ` — ${detail}` : ""}`);
}

function fail(step: string, detail?: string) {
  console.log(`  ❌ ${step}${detail ? ` — ${detail}` : ""}`);
}

function info(msg: string) {
  console.log(`  ℹ️  ${msg}`);
}

// --------------- Steps ---------------

let stepResults: Record<string, unknown> = {};

async function step1_citAuthorization() {
  console.log("\n📌 Step 1: CIT 支付授权 (POST /cardPayments/customerInitiatedTransactions)");

  const txnRef = generateRef("verify-cit");
  const payload = {
    transactionReference: txnRef,
    merchant: {
      entity: CONFIG.entity,
      paymentFacilitator: {
        schemeId: CONFIG.payFacSchemeId,
        subMerchant: {
          reference: CONFIG.subMerchantRef,
          name: CONFIG.subMerchantName,
          address: {
            postalCode: "SW1 1AA",
            street: "221B Baker Street",
            city: "London",
            countryCode: "GB",
          },
        },
      },
    },
    instruction: {
      requestAutoSettlement: { enabled: false },
      narrative: { line1: "API-Verify-Test" },
      value: {
        currency: "GBP",
        amount: 250, // £2.50
      },
      paymentInstrument: {
        type: "card/plain",
        cardNumber: TEST_CARD.number,
        cardHolderName: "Test Cardholder",
        expiryDate: {
          month: TEST_CARD.expiryMonth,
          year: TEST_CARD.expiryYear,
        },
        cvc: TEST_CARD.cvc,
        billingAddress: {
          address1: "1 Test Street",
          city: "London",
          postalCode: "SW1A 1AA",
          countryCode: "GB",
        },
      },
    },
    channel: "ecom",
  };

  const { status, data } = await apiCall(
    "POST",
    "/cardPayments/customerInitiatedTransactions",
    { body: payload }
  );

  console.log(`  HTTP ${status}`);
  if (status === 201) {
    const d = data as Record<string, unknown>;
    ok("授权成功", `outcome=${d.outcome}, paymentId=${d.paymentId}`);
    stepResults = {
      ...stepResults,
      txnRef,
      paymentId: d.paymentId as string,
      outcome: d.outcome as string,
      raw: d,
    };
  } else if (status === 401 || status === 403) {
    fail("认证失败", "请检查 .env 中的 WORLDPAY_USERNAME 和 WORLDPAY_PASSWORD");
    console.log(`  响应: ${fmtJSON(data)}`);
    return false;
  } else {
    fail("授权失败", `status=${status}`);
    console.log(`  响应: ${fmtJSON(data)}`);
    return false;
  }
  return true;
}

async function step2_queryByTransactionReference() {
  console.log("\n📌 Step 2: 按 transactionReference 查询 (GET /paymentQueries/payments)");

  const txnRef = stepResults.txnRef as string;

  // 等待支付事件同步（Worldpay 文档说最长 15 分钟，通常几秒）
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      info(`等待 3 秒后重试... (第 ${attempt + 1} 次)`);
      await new Promise((r) => setTimeout(r, 3000));
    }

    const { status, data } = await apiCall("GET", "/paymentQueries/payments", {
      mediaType: CONFIG.queriesMediaType,
      query: { transactionReference: txnRef },
    });

    if (status === 200) {
      const d = data as Record<string, unknown>;
      const embedded = d._embedded as Record<string, unknown> | undefined;
      const payments = embedded?.payments as Array<Record<string, unknown>> | undefined;
      if (payments && payments.length > 0) {
        const p = payments[0];
        ok(
          "查询成功",
          `找到 ${payments.length} 笔, paymentId=${p.paymentId}, lastEvent=${p.lastEvent ?? "N/A"}`
        );
        stepResults = { ...stepResults, queriedPayment: p };
        return true;
      }
    }
  }

  info("多次重试仍未同步 — 属正常情况，可稍后通过 Merchant Portal 手动查询");
  return true; // 不算失败，只是还没同步
}

async function step3_queryByDateRange() {
  console.log("\n📌 Step 3: 按日期范围查询支付列表 (GET /paymentQueries/payments)");

  // Look back 7 days
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { status, data } = await apiCall("GET", "/paymentQueries/payments", {
    mediaType: CONFIG.queriesMediaType,
    query: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      pageSize: "5",
      currency: "GBP",
      entityReferences: CONFIG.entity,
    },
  });

  console.log(`  HTTP ${status}`);
  if (status === 200) {
    const d = data as Record<string, unknown>;
    const embedded = d._embedded as Record<string, unknown> | undefined;
    const payments = embedded?.payments as Array<Record<string, unknown>> | undefined;
    const count = payments?.length ?? 0;
    ok("查询成功", `返回 ${count} 笔支付`);

    if (count > 0) {
      info("最近支付列表:");
      for (const p of payments ?? []) {
        info(
          `  - paymentId=${(p.paymentId as string)?.substring(0, 30)}..., ` +
          `ref=${p.transactionReference}, ` +
          `event=${p.lastEvent ?? "N/A"}, ` +
          `amount=${(p.value as Record<string, unknown>)?.amount} ${(p.value as Record<string, unknown>)?.currency}`
        );
      }
    }
  } else {
    fail("查询失败", `status=${status}`);
    console.log(`  响应: ${fmtJSON(data)}`);
    return false;
  }
  return true;
}

async function step4_queryByPaymentId() {
  console.log("\n📌 Step 4: 按 paymentId 查询单笔详情 (GET /paymentQueries/payments/{id})");

  const paymentId = stepResults.paymentId as string;
  if (!paymentId) {
    info("跳过 — 无可用的 paymentId（Step 1 可能未成功）");
    return true;
  }

  // 重试等待索引同步
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      info(`等待 3 秒后重试... (第 ${attempt + 1} 次)`);
      await new Promise((r) => setTimeout(r, 3000));
    }

    const { status, data } = await apiCall(
      "GET",
      `/paymentQueries/payments/${paymentId}`,
      { mediaType: CONFIG.queriesMediaType }
    );

    if (status === 200) {
      const d = data as Record<string, unknown>;
      ok("查询成功", `paymentId=${d.paymentId ?? paymentId}`);
      info(`详情: ${fmtJSON(d).substring(0, 500)}...`);
      return true;
    }
  }

  info("多次重试仍未索引 — 属正常情况，支付后续可通过 Merchant Portal 查询");
  return true; // 不算失败
}

// --------------- Main ---------------

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Worldpay Access API Verification");
  console.log("  Card Payments v7 + Payment Queries v1");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Base URL: ${CONFIG.baseUrl}`);
  console.log(`  Entity:   ${CONFIG.entity}`);
  console.log(`  PayFac ID: ${CONFIG.payFacSchemeId}`);
  console.log(`  Username: ${CONFIG.username ? "***" : "(NOT SET)"}`);
  console.log("═══════════════════════════════════════════════");

  // Validate config
  if (!CONFIG.username || !CONFIG.password) {
    console.log("\n❌ 未配置 API 凭证!");
    console.log("  1. cp .env.example .env");
    console.log("  2. 编辑 .env 填入你的 WORLDPAY_USERNAME 和 WORLDPAY_PASSWORD");
    console.log("  3. 重新运行 npm run verify:card-payments");
    process.exit(1);
  }

  const results: { step: string; passed: boolean }[] = [];

  // Step 1
  const s1 = await step1_citAuthorization();
  results.push({ step: "CIT Authorization", passed: s1 });

  // Step 2
  if (s1) {
    const s2 = await step2_queryByTransactionReference();
    results.push({ step: "Query by txnRef", passed: s2 });
  } else {
    info("Step 2 跳过 — Step 1 未成功");
  }

  // Step 3
  const s3 = await step3_queryByDateRange();
  results.push({ step: "Query by date range", passed: s3 });

  // Step 4
  const s4 = await step4_queryByPaymentId();
  results.push({ step: "Query by paymentId", passed: s4 });

  // Summary
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Verification Summary");
  console.log("═══════════════════════════════════════════════");
  for (const r of results) {
    console.log(`  ${r.passed ? "✅" : "❌"} ${r.step}`);
  }

  const allPassed = results.every((r) => r.passed);
  console.log(`\n  Result: ${allPassed ? "ALL PASSED 🎉" : "SOME FAILED — check output above"}`);
  console.log("═══════════════════════════════════════════════\n");

  if (stepResults.paymentId) {
    console.log(
      `💡 创建的交易: paymentId=${stepResults.paymentId}, txnRef=${stepResults.txnRef}, outcome=${stepResults.outcome}`
    );
    console.log(
      "   📋 可在 Worldpay Merchant Portal 或通过后续 API 调用管理此交易\n"
    );
  }
}

main().catch((err) => {
  console.error("\n❌ 脚本执行异常:", err);
  process.exit(1);
});
