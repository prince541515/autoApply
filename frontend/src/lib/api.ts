import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "@/lib/auth";
import type { AuthTokens } from "@/types";

function apiBaseUrl(): string {
  const direct = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
  if (typeof window === "undefined") {
    return direct;
  }
  // Browser calls same origin; Next/Vercel rewrites /backend to Railway.
  // That avoids ISP DNS failures for *.up.railway.app.
  return "/backend";
}

const API_URL = apiBaseUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

const refreshClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const AUTH_ENDPOINTS = [
  "/auth/login",
  "/auth/register",
  "/auth/activate",
  "/auth/verify-email",
  "/auth/resend-otp",
  "/auth/refresh",
];
const AUTH_PAGES = ["/login", "/register", "/activate"];

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  const { data } = await refreshClient.post<AuthTokens>("/auth/refresh", {
    refresh_token: refresh,
  });
  setTokens(data.access_token, data.refresh_token, data.account_status);
  return data.access_token;
}

function queuedRefresh(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function onAuthPage(): boolean {
  return (
    typeof window !== "undefined" &&
    AUTH_PAGES.some((path) => window.location.pathname.startsWith(path))
  );
}

function signOut(): void {
  if (typeof window === "undefined" || onAuthPage()) return;
  clearTokens();
  window.location.assign("/login");
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetryConfig | undefined;
    const url = String(original?.url ?? "");
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => url.includes(path));

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      if (!getRefreshToken()) {
        signOut();
        return Promise.reject(error);
      }
      try {
        const nextToken = await queuedRefresh();
        if (nextToken) {
          original.headers.Authorization = `Bearer ${nextToken}`;
          return api(original);
        }
        signOut();
      } catch (refreshErr) {
        const refreshStatus = (refreshErr as AxiosError).response?.status;
        if (refreshStatus === 401 || refreshStatus === 403) {
          signOut();
        }
      }
    }

    return Promise.reject(error);
  },
);

export function getApiErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ detail?: unknown }>;
  const code = axiosErr.code;
  if (code === "ECONNABORTED") {
    return "Request timed out. Try again in a moment.";
  }
  if (code === "ERR_NETWORK" || axiosErr.message === "Network Error") {
    return "Cannot reach AutoApply servers right now. Wait a moment and try again.";
  }
  const detail = axiosErr.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === "object" && item && "msg" in item
          ? String((item as { msg: string }).msg)
          : String(item),
      )
      .join("; ");
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export default api;
