import { getToken } from "./auth";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api";

// File URLs (attachments, completion photos) come back as paths relative to
// the API's origin (e.g. "/uploads/xxx.png"), served outside the "/api"
// prefix — resolve them against the API origin, not the frontend's own.
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

export function resolveFileUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function parseErrorBody(res: Response): Promise<{ code: string; message: string }> {
  try {
    const json = await res.json();
    if (json?.error?.code) {
      return { code: json.error.code, message: json.error.message ?? res.statusText };
    }
  } catch {
    // response body wasn't JSON (or was empty) — fall through to a generic error
  }
  return { code: "UNKNOWN_ERROR", message: res.statusText || "요청 처리 중 오류가 발생했습니다." };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean; // attach Authorization header — default true
  isForm?: boolean;
  cache?: RequestCache;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, isForm = false, cache } = options;
  const headers: Record<string, string> = {};

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (isForm) {
      payload = body as FormData;
    } else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: payload,
      cache,
    });
  } catch {
    // 서버에 아예 연결이 안 되면 fetch가 예외를 던진다(응답이 없으므로 아래 상태코드
    // 분기까지 오지 않는다). 이 경우를 구분해두지 않으면 화면에서 "로그인 실패" 같은
    // 입력값 문제로 오해되는 메시지가 뜬다 — 서버 기동 중이 대표적인 경우다.
    throw new ApiError(
      "NETWORK_ERROR",
      "서버에 연결할 수 없습니다. 서버가 켜지는 중일 수 있으니 잠시 후 다시 시도해주세요.",
      0,
    );
  }

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiError(code, message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
  return request<T>(path, { ...options, method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
  return request<T>(path, { ...options, method: "POST", body });
}

export function apiPatch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
  return request<T>(path, { ...options, method: "PATCH", body });
}

export function apiPut<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
  return request<T>(path, { ...options, method: "PUT", body });
}

export function apiPostForm<T>(path: string, formData: FormData, options?: Omit<RequestOptions, "method" | "body" | "isForm">): Promise<T> {
  return request<T>(path, { ...options, method: "POST", body: formData, isForm: true });
}

/**
 * Downloads a binary response (e.g. the admin xlsx export) with the auth
 * header attached, then triggers a browser save via an object URL — a plain
 * <a href> can't carry the Authorization header the admin export requires.
 */
export async function apiDownload(path: string, fallbackFileName: string): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { headers });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "서버에 연결할 수 없습니다. 서버가 켜지는 중일 수 있으니 잠시 후 다시 시도해주세요.",
      0,
    );
  }
  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new ApiError(code, message, res.status);
  }

  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^;"]+)/i);
  const fileName = match ? decodeURIComponent(match[1].replace(/"/g, "")) : fallbackFileName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
