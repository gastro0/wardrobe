import { env } from "cloudflare:workers";
import { readSessionCookie, verifyTelegramSession } from "./telegram-auth";
import { createSupabaseStorage, type PhotoStorage } from "./photo-storage";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function db() {
  if (!env.DB) throw new ApiError(503, "Гардероб временно недоступен. Попробуйте ещё раз.");
  return env.DB;
}

export function bucket(): PhotoStorage {
  const unavailable = () => new ApiError(503, "Не удалось подключиться к фотографиям. Попробуйте ещё раз.");
  if (env.PHOTO_STORAGE === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.SUPABASE_STORAGE_BUCKET) {
      throw unavailable();
    }
    return createSupabaseStorage({
      url: env.SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
      bucket: env.SUPABASE_STORAGE_BUCKET,
    });
  }
  if (env.PHOTO_STORAGE && env.PHOTO_STORAGE !== "r2") throw unavailable();
  if (!env.BUCKET) throw unavailable();
  return env.BUCKET;
}

export function localPreview(request: Request) {
  return env.ALLOW_LOCAL_DEVELOPMENT === "true" && !env.TELEGRAM_BOT_TOKEN &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
}

export async function user(request: Request) {
  if (localPreview(request)) return "private-wardrobe";
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new ApiError(503, "Приложение ещё настраивается. Попробуйте зайти позже.");
  }
  const origin = new URL(request.url).origin;
  const id = await verifyTelegramSession(readSessionCookie(request), env.TELEGRAM_BOT_TOKEN, origin);
  if (id === null) {
    throw new ApiError(401, "Вход истёк. Закройте приложение и откройте его снова из Telegram.");
  }
  // Only an explicitly configured account can inherit the pre-Telegram wardrobe.
  return String(id) === env.TELEGRAM_OWNER_ID ? "private-wardrobe" : `telegram:${id}`;
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || origin !== new URL(request.url).origin) {
    throw new ApiError(403, "Не удалось проверить запрос. Обновите страницу.");
  }
}

export async function protect(request: Request) {
  checkOrigin(request);
  return user(request);
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: "Не удалось прочитать данные." }, 400);
  console.error("Wardrobe request failed", error);
  return json({ error: "Не удалось выполнить действие. Ваши изменения не потеряны — попробуйте ещё раз." }, 503);
}

export async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 30_000) {
    throw new ApiError(413, "Слишком большой запрос.");
  }
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Неверный формат данных.");
  }
  return value as Record<string, unknown>;
}
