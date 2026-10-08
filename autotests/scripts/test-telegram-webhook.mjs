import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, Response } from "miniflare";
import { projectRoot } from "../project.mjs";
const origin = "https://telegram-wardrobe.test";
const token = "123456:test-only-not-a-real-bot-token";
const secret = "test-webhook-secret";
const calls = [];
const menuCalls = [];
let failSend = false;
let failMenu = false;

const bundle = await build({
  stdin: { contents: `
    import * as webhook from './app/api/telegram/webhook/route.ts';
    export default { fetch(request) { return webhook.POST(request); } };`,
    resolveDir: projectRoot, sourcefile: "telegram-webhook-test-worker.ts" },
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022",
  conditions: ["workerd", "worker", "browser"], external: ["cloudflare:workers"],
});

const worker = new Miniflare({
  modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  bindings: { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret,
    TELEGRAM_MINI_APP_URL: "https://forma.example/" },
  outboundService: async request => {
    if (request.url === `https://api.telegram.org/bot${token}/setChatMenuButton`) {
      menuCalls.push(await request.json());
      return Response.json({ ok: !failMenu }, { status: failMenu ? 503 : 200 });
    }
    assert.equal(request.url, `https://api.telegram.org/bot${token}/sendMessage`);
    calls.push(await request.json());
    return Response.json({ ok: !failSend }, { status: failSend ? 503 : 200 });
  },
});

const send = (update, header = secret) => worker.dispatchFetch(origin + "/api/telegram/webhook", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": header },
  body: JSON.stringify(update),
});

try {
  const start = { update_id: 1, message: { chat: { id: 123, type: "private" }, text: "/start" } };
  assert.equal((await send(start, "wrong")).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await send(start)).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].chat_id, 123);
  assert.match(calls[0].text, /образ по погоде/);
  assert.deepEqual(menuCalls[0], { chat_id: 123, menu_button: {
    type: "web_app", text: "мой гардероб", web_app: { url: "https://forma.example/" },
  } });
  assert.deepEqual(calls[0].reply_markup, { inline_keyboard: [[{
    text: "Открыть «Форму»", web_app: { url: "https://forma.example/" },
  }]] });
  assert.equal((await send({ ...start, message: { ...start.message, text: "/start source" } })).status, 200);
  assert.equal(calls.length, 2, "Start payload still opens the app");
  for (const update of [
    { message: { chat: { id: 123, type: "private" }, text: "/starting" } },
    { message: { chat: { id: 123, type: "group" }, text: "/start" } },
    { message: { chat: { id: "123", type: "private" }, text: "/start" } },
    { callback_query: { id: "unused" } },
  ]) assert.equal((await send(update)).status, 200);
  assert.equal(calls.length, 2, "Unrelated updates do not send messages");
  const invalid = await worker.dispatchFetch(origin + "/api/telegram/webhook", {
    method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": secret }, body: "{",
  });
  assert.equal(invalid.status, 400);
  failMenu = true;
  assert.equal((await send(start)).status, 502, "Telegram retries a failed menu update");
  assert.equal(calls.length, 2, "No welcome message is sent before the menu is ready");
  failMenu = false;
  failSend = true;
  assert.equal((await send(start)).status, 502, "Telegram retries a failed reply");
} finally { await worker.dispose(); }

console.log("PASS: /start webhook authentication, Mini App button, ignored updates and Telegram API failure");
