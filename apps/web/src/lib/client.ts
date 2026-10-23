"use client";
import {clientUuid,requestDigest} from "./browser-crypto";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const reply = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await reply.json();
  if (!reply.ok) {
    if (reply.status === 401 && location.pathname.startsWith("/app"))
      location.assign(data.error?.code==='SUPPORT_UNAVAILABLE'?'/superadmin':'/signin');
    throw new ApiError(
      data.error?.code ?? "REQUEST_FAILED",
      data.error?.message ?? "The request failed.",
      reply.status,
    );
  }
  return data;
}
export async function command<T = any>(
  action: string,
  input?: unknown,
  extra: Record<string, unknown> = {},
): Promise<T> {
  return idempotentPost<T>("/api/commands", { action, input, ...extra });
}
export async function idempotentPost<T = any>(
  url: string,
  payload: unknown,
): Promise<T> {
  const body = JSON.stringify(payload);
  const digest = await requestDigest(url + body);
  const slot = "dd-request-" + digest;
  const key = sessionStorage.getItem(slot) ?? clientUuid();
  sessionStorage.setItem(slot, key);
  let result: T;
  try {
    result = await request<T>(url, {
      method: "POST",
      body,
      headers: { "Idempotency-Key": key },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status < 500)
      sessionStorage.removeItem(slot);
    throw error instanceof TypeError
      ? new Error(
          "Connection interrupted. Retry to safely resume the same request.",
        )
      : error;
  }
  sessionStorage.removeItem(slot);
  return result;
}
export const money = (n: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((Number(n ?? 0) + 0) / 100);
export const date = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }).format(new Date(String(value)))
    : "—";
export const label = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export type Row = Record<string, any>;
