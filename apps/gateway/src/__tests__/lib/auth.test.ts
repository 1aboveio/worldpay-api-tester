/**
 * Tests for auth utilities (hashApiKey, extractBearerToken)
 */
import { describe, it, expect } from "vitest"
import { hashApiKey, extractBearerToken } from "@/lib/auth"

describe("hashApiKey", () => {
  it("produces consistent SHA-256 hashes", () => {
    const hash1 = hashApiKey("sk_test_abc")
    const hash2 = hashApiKey("sk_test_abc")
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // SHA-256 hex is 64 chars
  })

  it("produces different hashes for different keys", () => {
    const hash1 = hashApiKey("sk_test_abc")
    const hash2 = hashApiKey("sk_test_xyz")
    expect(hash1).not.toBe(hash2)
  })
})

describe("extractBearerToken", () => {
  it("extracts token from valid Authorization header", () => {
    expect(extractBearerToken("Bearer sk_test_abc123")).toBe("sk_test_abc123")
    expect(extractBearerToken("bearer sk_test_abc123")).toBe("sk_test_abc123")
  })

  it("returns null for missing header", () => {
    expect(extractBearerToken(null)).toBeNull()
    expect(extractBearerToken("")).toBeNull()
  })

  it("returns null for malformed header", () => {
    expect(extractBearerToken("Basic abc123")).toBeNull()
    expect(extractBearerToken("Bearer")).toBeNull()
    expect(extractBearerToken("sk_test_abc")).toBeNull()
  })
})
