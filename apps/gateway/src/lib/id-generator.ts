/**
 * Cryptographically secure ID generator.
 * Uses nanoid-like approach with custom prefixes.
 */

import crypto from "node:crypto";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_LENGTH = 20;

function generateId(): string {
  const bytes = crypto.randomBytes(ID_LENGTH);
  let result = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}

export function generatePaymentMethodId(): string {
  return `pm_${generateId()}`;
}

export function generatePaymentIntentId(): string {
  return `pi_${generateId()}`;
}

export function generateCheckoutSessionId(): string {
  return `cs_${generateId()}`;
}
