import "server-only"
import { database } from "@repo/database"

export interface MerchantDTO {
  id: string
  name: string
  worldpayEntity: string
  payfacSchemeId: string | null
  subMerchantRef: unknown | null
  subMerchantName: string | null
  subMerchantAddress: unknown | null
  fraudsightConfig: unknown | null
  status: string
}

export interface ApiKeyDTO {
  id: string
  keyHash: string
  merchantId: string
  merchant: MerchantDTO
}

export async function getApiKeyByHash(keyHash: string): Promise<ApiKeyDTO | null> {
  const apiKey = await database.apiKey.findUnique({
    where: { keyHash },
    include: { merchant: true },
  })
  if (!apiKey) return null
  return {
    id: apiKey.id,
    keyHash: apiKey.keyHash,
    merchantId: apiKey.merchantId,
    merchant: {
      id: apiKey.merchant.id,
      name: apiKey.merchant.name,
      worldpayEntity: apiKey.merchant.worldpayEntity,
      payfacSchemeId: apiKey.merchant.payfacSchemeId,
      subMerchantRef: apiKey.merchant.subMerchantRef,
      subMerchantName: apiKey.merchant.subMerchantName,
      subMerchantAddress: apiKey.merchant.subMerchantAddress,
      fraudsightConfig: apiKey.merchant.fraudsightConfig,
      status: apiKey.merchant.status,
    },
  }
}

export async function getMerchantById(id: string): Promise<MerchantDTO | null> {
  const merchant = await database.merchant.findUnique({ where: { id } })
  if (!merchant) return null
  return {
    id: merchant.id,
    name: merchant.name,
    worldpayEntity: merchant.worldpayEntity,
    payfacSchemeId: merchant.payfacSchemeId,
    subMerchantRef: merchant.subMerchantRef,
    subMerchantName: merchant.subMerchantName,
    subMerchantAddress: merchant.subMerchantAddress,
    fraudsightConfig: merchant.fraudsightConfig,
    status: merchant.status,
  }
}
