// Test setup — set required env vars for test environment
process.env.WORLDPAY_BASE_URL = "https://try.access.worldpay.com"
process.env.WORLDPAY_USERNAME = "test_user"
process.env.WORLDPAY_PASSWORD = "test_pass"
process.env.DATABASE_URL = "postgres://localhost:5432/worldpay_gateway_test"
