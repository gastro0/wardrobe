"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import { configureTelegram, loadTelegramSdk, telegramApp } from "@/lib/telegram";
import WardrobeApp from "./wardrobe-app";

type Session = { authenticated: boolean; botUrl?: string | null; firstName?: string };
type EntryState = { status: "loading" | "ready" | "outside" | "error"; message?: string; botUrl?: string | null; firstName?: string };

export default function TelegramEntry() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<EntryState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let cleanup: (() => void) | undefined;
    async function open() {
      try {
        // Local preview remains usable offline. Public hosts always load the SDK.
        const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
        if (!local || window.location.hash.includes("tgWebAppData") || window.Telegram) await loadTelegramSdk();
        if (controller.signal.aborted) return;
        const app = telegramApp();
        let firstName: string | undefined;
        if (app) {
          cleanup = configureTelegram(app);
          // Always replace any previous account's cookie on a fresh Telegram launch.
          const session = await api<Session>("/api/telegram/session", {
            method: "POST", body: JSON.stringify({ initData: app.initData }), signal: controller.signal,
          });
          firstName = session.firstName;
        }
        const session = await api<Session>("/api/telegram/session", { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (app && !session.authenticated) {
          throw new Error("Не удалось сохранить вход. Откройте приложение в мобильном Telegram или разрешите cookies в браузере.");
        }
        setState({ status: session.authenticated ? "ready" : "outside", botUrl: session.botUrl, firstName });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: "error", message: error instanceof Error ? error.message : "Не удалось войти. Повторите попытку." });
      }
    }
    void open();
    return () => { controller.abort(); cleanup?.(); };
  }, [attempt]);

  if (state.status === "ready") return <WardrobeApp initialName={state.firstName}/>;
  return <main className="telegram-entry">
    <div className="telegram-entry-card">
      <span className="brand">форма</span>
      <ShieldCheck size={36} aria-hidden="true"/>
      <h1>{state.status === "loading" ? "Открываем ваш гардероб" : state.status === "error" ? "Не удалось войти" : "Ваш гардероб в Telegram"}</h1>
      {state.status === "loading" ? <p role="status"><LoaderCircle className="spin" size={18}/>Проверяем вход…</p> : <>
        <p role={state.status === "error" ? "alert" : undefined}>{state.message ?? "Откройте «Форму» из бота. Вещи, фотографии и образы будут доступны только вам."}</p>
        {state.botUrl && <a className="btn btn-primary" href={state.botUrl}>Открыть в Telegram<ArrowUpRight/></a>}
        <button className="btn" onClick={() => { setState({ status: "loading" }); setAttempt(value => value + 1); }}>Повторить</button>
      </>}
    </div>
  </main>;
}
