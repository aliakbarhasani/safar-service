// API service layer - تمام ارتباطات با بک‌اند در اینجا انجام می‌شود
import config from "@/config/app-config.json";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || config.api?.baseUrl || "http://localhost:8000";

interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `خطا در ارتباط با سرور (${response.status})`);
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

export default api;
