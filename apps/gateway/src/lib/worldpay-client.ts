/**
 * Worldpay HTTP client for the Access API.
 *
 * Uses HTTP Basic Auth with credentials from environment variables.
 * Handles media type negotiation via Accept/Content-Type headers.
 */

const BASE_URL = process.env.WORLDPAY_BASE_URL || "https://try.access.worldpay.com";
const USERNAME = process.env.WORLDPAY_USERNAME || "";
const PASSWORD = process.env.WORLDPAY_PASSWORD || "";

function getAuthHeader(): string {
  const encoded = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
  return `Basic ${encoded}`;
}

export interface WpCallOptions {
  method: string;
  path: string;
  mediaType: string;
  body?: unknown;
}

export async function wpCall(options: WpCallOptions): Promise<Response> {
  const { method, path, mediaType, body } = options;

  const headers: Record<string, string> = {
    Authorization: getAuthHeader(),
    Accept: mediaType,
    "Content-Type": mediaType,
  };

  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}
