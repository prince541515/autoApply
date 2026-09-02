export function setTokens(access: string, refresh: string, accountStatus?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
  const role = getUserRoleFromToken(access) ?? "";
  const status =
    accountStatus ?? getAccountStatusFromToken(access) ?? "";
  document.cookie = `role=${role};path=/;max-age=${60 * 60 * 24 * 7};samesite=lax`;
  document.cookie = `account_status=${status};path=/;max-age=${60 * 60 * 24 * 7};samesite=lax`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  document.cookie = "role=;path=/;max-age=0";
  document.cookie = "account_status=;path=/;max-age=0";
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getUserRoleFromToken(token: string): "admin" | "candidate" | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const role = (payload.role ?? payload.user_role) as string | undefined;
  if (role === "admin" || role === "candidate") return role;
  return null;
}

export function getUserRole(): "admin" | "candidate" | null {
  const token = getAccessToken();
  if (!token) return null;
  return getUserRoleFromToken(token);
}

function getAccountStatusFromToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const status = payload.account_status;
  return typeof status === "string" ? status : null;
}

export function getAccountStatus(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  return getAccountStatusFromToken(token);
}
