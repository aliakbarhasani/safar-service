// API service layer - تمام ارتباطات با بک‌اند در اینجا انجام می‌شود
import config from "@/config/app-config.json";
import { getAuthToken } from "@/lib/auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || config.api?.baseUrl || "http://localhost:8000";

interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// ==== قوانین مالی (فاز ۲) ====
// نمای مشتری (Passenger) هرگز نباید فیلد کمیسیون/مالیات/سهم سرویس‌دهنده را دریافت
// یا نمایش دهد. این DTOها فقط فیلدهای مشتری‌محور را تعریف می‌کنند و عمداً هیچ
// فیلدی به نام commission / tax / driverShare / platformFee ندارند.
export interface CustomerProductDto {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  quantity: number;
  imageUrl?: string;
  rating?: number;
}

export interface CampaignDto {
  id: string;
  name: string;
  description?: string;
  budget: number;
  spent: number;
  status: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  startDate?: string;
  endDate?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("ارتباط با سرور برقرار نشد", 0, "NETWORK_ERROR");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const msg =
      (body as ApiResponse<unknown>)?.message ||
      (body as { error?: string })?.error ||
      `خطا در ارتباط با سرور (${response.status})`;
    throw new ApiError(msg, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// Convenience API functions used by pages (keep business logic in src/services)
export async function requestOtp(phoneNumber: string) {
  return api.post<any>(config.api.endpoints.requestOtp, { phoneNumber });
}

export async function verifyOtp(phoneNumber: string, code: string) {
  return api.post<any>(config.api.endpoints.verifyOtp, { phoneNumber, code });
}

export async function registerUser(payload: {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
}) {
  return api.post<any>(config.api.endpoints.register, payload);
}

export async function getProfile() {
  return api.get<any>(config.api.endpoints.profile);
}

export async function getMarketplaceProducts() {
  return api.get<ApiResponse<{ products: CustomerProductDto[] }>>(
    config.api.endpoints.marketplaceProducts
  );
}

export async function getCampaigns() {
  return api.get<ApiResponse<CampaignDto[]>>(config.api.endpoints.campaignsList);
}

/** Helper: uniform error message for ApiError-capable callers. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default api;
