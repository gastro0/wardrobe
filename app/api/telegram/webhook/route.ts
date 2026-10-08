import { env } from "cloudflare:workers";
import { startChatId } from "@/lib/telegram-bot";

const MAX_UPDATE_BYTES = 64 * 1024;

async function telegramAccepted(response: Response) {
  if (!response.ok) return false;
  const result: unknown = await response.json();
  return !!result && typeof result === "object" && "ok" in result && result.ok === true;
}

async function readUpdate(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty Telegram update");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPDATE_BYTES) {
        await reader.cancel();
        throw new Error("Oversized Telegram update");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function POST(request: Request) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!secret || !token) return new Response(null, { status: 503 });
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
    return new Response(null, { status: 403 });
  }

  let update: unknown;
  try { update = await readUpdate(request); }
  catch { return new Response(null, { status: 400 }); }
  const chatId = startChatId(update);
  if (chatId === null) return new Response(null, { status: 200 });

  const appUrl = env.TELEGRAM_MINI_APP_URL || new URL("/", request.url).toString();
  try {
    if (new URL(appUrl).protocol !== "https:") return new Response(null, { status: 503 });
  } catch { return new Response(null, { status: 503 }); }
  try {
    const menuResponse = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        menu_button: { type: "web_app", text: "мой гардероб", web_app: { url: appUrl } },
      }),
    });
    if (!await telegramAccepted(menuResponse)) return new Response(null, { status: 502 });

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Что надеть сегодня? 👕\n\nДобавьте свои вещи в «Форму» — она подскажет образ по погоде. Весь гардероб под рукой в Telegram.",
        reply_markup: { inline_keyboard: [[{ text: "Открыть «Форму»", web_app: { url: appUrl } }]] },
      }),
    });
    if (!await telegramAccepted(response)) return new Response(null, { status: 502 });
    return new Response(null, { status: 200 });
  } catch {
    // Telegram retries the update when its API cannot be reached.
    return new Response(null, { status: 502 });
  }
}
