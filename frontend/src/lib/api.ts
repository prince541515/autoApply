import axios from "axios";
import { getAccessToken, clearTokens } from "@/lib/auth";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

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

const AUTH_ENDPOINTS = [
  "/auth/login",
  "/auth/register",
  "/auth/activate",
  "/auth/verify-email",
  "/auth/resend-otp",
];
const AUTH_PAGES = ["/login", "/register", "/activate"];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = String(error.config?.url ?? "");
    const hadAuth = Boolean(error.config?.headers?.Authorization);
    const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => url.includes(path));
    const onAuthPage =
      typeof window !== "undefined" &&
      AUTH_PAGES.some((path) => window.location.pathname.startsWith(path));

    if (
      status === 401 &&
      typeof window !== "undefined" &&
      hadAuth &&
      !isAuthEndpoint &&
      !onAuthPage
    ) {
      clearTokens();
      window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);

export function getApiErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })
    ?.response?.data?.detail;
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
