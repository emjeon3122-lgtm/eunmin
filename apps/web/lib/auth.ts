"use client";

import type { User } from "./types";

// Dev-mode auth storage. The API also sets an httpOnly cookie, but since the
// web app and API run on different ports/origins in dev that cookie isn't
// usable by this app, so we keep our own readable copies:
//  - localStorage: source of truth for client fetches (Authorization header)
//  - a plain (non-httpOnly) cookie: readable by middleware.ts for route guards
const TOKEN_KEY = "wreath_token";
const USER_KEY = "wreath_user";
const TOKEN_COOKIE = "wreath_token";
const ROLE_COOKIE = "wreath_role";

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export function setAuth(token: string, user: User) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  setCookie(TOKEN_COOKIE, token);
  setCookie(ROLE_COOKIE, user.role);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  deleteCookie(TOKEN_COOKIE);
  deleteCookie(ROLE_COOKIE);
}
