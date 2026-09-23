import { z } from "zod";

const encoder = new TextEncoder();
export const SESSION_SECONDS = 12 * 60 * 60;
export const SESSION_COOKIE = "__Host-forma-session";
const INIT_DATA_SECONDS = 5 * 60;
const telegramUser = z.object({
  id: z.number().int().positive().safe(),
  first_name: z.string().max(256),
});

async function hmacKey(secret: string | ArrayBuffer) {
  return crypto.subtle.importKey("raw", typeof secret === "string" ? encoder.encode(secret) : secret,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function signatureBytes(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/../g)!, pair => Number.parseInt(pair, 16));
}

function hex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, "0")).join("");
}

// Use Web Crypto so verification runs in Workers as well as the test runtime.
export async function validateTelegramInitData(initData: string, botToken: string, now = Date.now(), maxAgeSeconds = INIT_DATA_SECONDS) {
  if (!initData || initData.length > 16_384) return null;
  const fields = new URLSearchParams(initData);
  const keys = [...fields.keys()];
  if (new Set(keys).size !== keys.length) return null;
  const signature = signatureBytes(fields.get("hash") ?? "");
  const date = fields.get("auth_date") ?? "";
  if (!signature || !/^\d+$/.test(date)) return null;
  const age = Math.floor(now / 1000) - Number(date);
  if (age < -30 || age > maxAgeSeconds) return null;
  fields.delete("hash");
  fields.sort();
  const checkString = [...fields].map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = await crypto.subtle.sign("HMAC", await hmacKey("WebAppData"), encoder.encode(botToken));
  if (!await crypto.subtle.verify("HMAC", await hmacKey(secret), signature, encoder.encode(checkString))) return null;
  try {
    const parsed = telegramUser.safeParse(JSON.parse(fields.get("user") ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

async function sessionKey(botToken: string) {
  const secret = await crypto.subtle.sign("HMAC", await hmacKey(botToken), encoder.encode("forma/telegram-session/v1"));
  return hmacKey(secret);
}

export async function createTelegramSession(id: number, botToken: string, origin: string, now = Date.now()) {
  const payload = `v1.${id}.${Math.floor(now / 1000) + SESSION_SECONDS}`;
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(botToken), encoder.encode(`${origin}\n${payload}`));
  return `${payload}.${hex(signature)}`;
}

export async function verifyTelegramSession(token: string, botToken: string, origin: string, now = Date.now()) {
  const match = /^v1\.(\d+)\.(\d+)\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const id = Number(match[1]);
  const remaining = Number(match[2]) - Math.floor(now / 1000);
  if (!Number.isSafeInteger(id) || id <= 0 || remaining <= 0 || remaining > SESSION_SECONDS + 30) return null;
  const payload = token.slice(0, token.lastIndexOf("."));
  const valid = await crypto.subtle.verify("HMAC", await sessionKey(botToken), signatureBytes(match[3])!, encoder.encode(`${origin}\n${payload}`));
  return valid ? id : null;
}

export function readSessionCookie(request: Request) {
  const matches = (request.headers.get("cookie") ?? "").split(";")
    .map(value => value.trim()).filter(value => value.startsWith(`${SESSION_COOKIE}=`));
  return matches.length === 1 ? matches[0].slice(SESSION_COOKIE.length + 1) : "";
}

export function sessionCookie(token: string) {
  // Partitioned cookies also support Mini Apps inside Telegram Web's iframe.
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${SESSION_SECONDS}`;
}
