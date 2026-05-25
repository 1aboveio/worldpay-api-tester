import { WorldpayClient } from "@payfac/worldpay-client/client";
import type { IWorldpayClient } from "@payfac/worldpay-client";

let client: IWorldpayClient | null = null;

export function getWorldpayClient(): IWorldpayClient {
  if (!client) {
    client = new WorldpayClient(
      process.env.WORLDPAY_BASE_URL ?? "https://try.access.worldpay.com",
      process.env.WORLDPAY_USERNAME ?? "",
      process.env.WORLDPAY_PASSWORD ?? ""
    );
  }
  return client;
}

/** For testing: inject a mock client */
export function setWorldpayClient(mock: IWorldpayClient): void {
  client = mock;
}
