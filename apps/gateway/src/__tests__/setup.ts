// Test setup: set required env vars
process.env.ENCRYPTION_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
process.env.WORLDPAY_BASE_URL = "https://try.access.worldpay.com";
process.env.WORLDPAY_USERNAME = "test-user";
process.env.WORLDPAY_PASSWORD = "test-pass";
