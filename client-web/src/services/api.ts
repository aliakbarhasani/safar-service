// API service layer - تمام ارتباطات با بک‌اند در اینجا انجام می‌شود
import config from "@/config/app-config.json";

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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      cache: "no-store",
      // Access token is HttpOnly; browser sends it as a cookie, never via JS.
      credentials: "include",
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
// قرارداد واحد بک‌اند: { success, status_code, message, data: { token, user } }
export interface AuthDataDto {
  token?: string;
  user: {
    id: string;
    phoneNumber: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string;
    status: string;
  };
}

export interface AuthResponseDto extends ApiResponse<AuthDataDto> {}

export async function requestOtp(
  phoneNumber: string
): Promise<ApiResponse<{ phoneNumber: string; otpCode?: string; expiresAt: string }>> {
  return api.post(config.api.endpoints.requestOtp, { phoneNumber });
}

export async function verifyOtp(phoneNumber: string, code: string): Promise<AuthResponseDto> {
  // قرارداد بک‌اند: فیلد کد باید `otpCode` باشد (نه `code`).
  return api.post<AuthResponseDto>(config.api.endpoints.verifyOtp, {
    phoneNumber,
    otpCode: code,
  });
}

export async function registerUser(payload: {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  email?: string;
  /**
   * قرارداد بک‌اند پسورد را الزامی می‌داند؛ اما ورود واقعی کاربر از مسیر OTP
   * انجام می‌شود. صفحه ثبت‌نام یک رمز تصادفی تولید می‌کند تا قرارداد حفظ شود؛
   * فقط hash آن در دیتابیس ذخیره می‌شود و هرگز استفاده نمایشی ندارد.
   */
  password: string;
}): Promise<ApiResponse<Record<string, unknown>>> {
  return api.post(config.api.endpoints.register, payload);
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
