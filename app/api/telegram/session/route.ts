import { env } from "cloudflare:workers";
import { ApiError, checkOrigin, failure, json, localPreview, user } from "@/lib/server";
import { createTelegramSession, readSessionCookie, SESSION_SECONDS, sessionCookie, validateTelegramInitData, verifyTelegramSession } from "@/lib/telegram-auth";

export async function GET(request: Request) {
  const username = env.TELEGRAM_BOT_USERNAME;
  const botUrl = username && /^[a-zA-Z0-9_]{5,32}$/.test(username) ? `https://t.me/${username}?startapp` : null;
  try {
    await user(request);
    return json({ authenticated: true, botUrl });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return json({ authenticated: false, botUrl });
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (localPreview(request)) return json({ authenticated: true });
    if (!env.TELEGRAM_BOT_TOKEN) throw new ApiError(503, "Приложение ещё настраивается. Попробуйте зайти позже.");
    // Bound the body while reading, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, "Не удалось прочитать данные входа.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32_768) {
          await reader.cancel();
          throw new ApiError(413, "Слишком большой запрос.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || !("initData" in body) || typeof body.initData !== "string") {
      throw new ApiError(400, "Откройте приложение из Telegram.");
    }
    const account = await validateTelegramInitData(body.initData, env.TELEGRAM_BOT_TOKEN);
    if (!account) {
      // Reloading an open Mini App must not extend a session using old initData.
      const existing = await verifyTelegramSession(readSessionCookie(request), env.TELEGRAM_BOT_TOKEN, new URL(request.url).origin);
      const previous = existing === null ? null : await validateTelegramInitData(body.initData, env.TELEGRAM_BOT_TOKEN, Date.now(), SESSION_SECONDS);
      if (previous && previous.id === existing) return json({ authenticated: true, firstName: previous.first_name, telegramId: previous.id });
      throw new ApiError(401, "Не удалось подтвердить вход. Закройте приложение и откройте его снова из Telegram.");
    }
    const token = await createTelegramSession(account.id, env.TELEGRAM_BOT_TOKEN, new URL(request.url).origin);
    const response = json({ authenticated: true, firstName: account.first_name, telegramId: account.id });
    response.headers.set("Set-Cookie", sessionCookie(token));
    return response;
  } catch (error) { return failure(error); }
}
