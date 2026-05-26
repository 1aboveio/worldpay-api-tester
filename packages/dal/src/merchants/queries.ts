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
