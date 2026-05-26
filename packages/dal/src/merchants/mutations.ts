import "server-only"
import { database } from "@repo/database"

export interface ApiKeyDTO {
  id: string
  merchantId: string
  keyHash: string
  scopes: string
}

export async function getApiKeyByHash(
  keyHash: string
): Promise<(ApiKeyDTO & { merchant: { id: string; name: string; worldpayEntity: string; status: string } }) | null> {
  const apiKey = await database.apiKey.findUnique({
    where: { keyHash },
    include: { merchant: true },
  })
  if (!apiKey) return null
  return {
    id: apiKey.id,
    merchantId: apiKey.merchantId,
    keyHash: apiKey.keyHash,
    scopes: apiKey.scopes,
    merchant: {
      id: apiKey.merchant.id,
      name: apiKey.merchant.name,
      worldpayEntity: apiKey.merchant.worldpayEntity,
      status: apiKey.merchant.status,
    },
  }
}
