import type {
  IWorldpayClient,
  DdcInitRequest,
  DdcInitResponse,
  ThreeDSAuthenticateRequest,
  ThreeDSAuthenticateResponse,
  ThreeDSVerifyRequest,
  ThreeDSVerifyResponse,
  CITAuthorizeRequest,
  CITAuthorizeResponse,
} from "./index";
import { MEDIA_TYPES } from "./index";

export class WorldpayClient implements IWorldpayClient {
  constructor(
    private baseUrl: string,
    private username: string,
    private password: string
  ) {}

  private async wpCall<T>(
    method: string,
    path: string,
    mediaType: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const auth = Buffer.from(`${this.username}:${this.password}`).toString(
      "base64"
    );
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      Accept: mediaType,
    };
    if (body) {
      headers["Content-Type"] = mediaType;
    }
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        `Worldpay API error: ${res.status} ${JSON.stringify(data)}`
      );
    }
    return data as T;
  }

  async threeDSInit(params: DdcInitRequest): Promise<DdcInitResponse> {
    return this.wpCall<DdcInitResponse>(
      "POST",
      "/verifications/customers/3ds/deviceDataInitialize",
      MEDIA_TYPES.THREEDS,
      params
    );
  }

  async threeDSAuthenticate(
    params: ThreeDSAuthenticateRequest
  ): Promise<ThreeDSAuthenticateResponse> {
    return this.wpCall<ThreeDSAuthenticateResponse>(
      "POST",
      "/verifications/customers/3ds/authenticate",
      MEDIA_TYPES.THREEDS,
      params
    );
  }

  async threeDSVerify(
    params: ThreeDSVerifyRequest
  ): Promise<ThreeDSVerifyResponse> {
    return this.wpCall<ThreeDSVerifyResponse>(
      "POST",
      "/verifications/customers/3ds/verification",
      MEDIA_TYPES.THREEDS,
      params
    );
  }

  async citAuthorize(
    params: CITAuthorizeRequest
  ): Promise<CITAuthorizeResponse> {
    return this.wpCall<CITAuthorizeResponse>(
      "POST",
      "/cardPayments/customerInitiatedTransactions",
      MEDIA_TYPES.CARD_PAYMENTS_V7,
      params
    );
  }
}
