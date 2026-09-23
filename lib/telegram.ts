export interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor(color: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  onEvent(event: string, handler: () => void): void;
  offEvent(event: string, handler: () => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
}

declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

export function telegramApp() {
  if (typeof window === "undefined") return undefined;
  const app = window.Telegram?.WebApp;
  return app?.initData ? app : undefined;
}

let sdkLoading: Promise<void> | undefined;
export function loadTelegramSdk(): Promise<void> {
  if (window.Telegram?.WebApp) return Promise.resolve();
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js?63";
    script.async = true;
    const timer = window.setTimeout(() => finish(false), 12_000);
    function finish(ok: boolean) {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (ok) resolve();
      else {
        script.remove();
        sdkLoading = undefined;
        reject(new Error("Не удалось подключиться к Telegram. Проверьте интернет и повторите попытку."));
      }
    }
    script.onload = () => finish(!!window.Telegram?.WebApp);
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
  return sdkLoading;
}

export function configureTelegram(app: TelegramWebApp) {
  const root = document.documentElement;
  root.dataset.telegram = "true";
  const theme = () => {
    root.dataset.theme = app.colorScheme;
    const color = app.colorScheme === "dark" ? "#181818" : "#ffffff";
    if (app.isVersionAtLeast("6.1")) app.setBackgroundColor(color);
    if (app.isVersionAtLeast("6.9")) app.setHeaderColor(color);
    if (app.isVersionAtLeast("7.10")) app.setBottomBarColor(color);
  };
  theme();
  app.onEvent("themeChanged", theme);
  app.expand();
  app.ready();
  return () => {
    app.offEvent("themeChanged", theme);
    delete root.dataset.telegram;
    delete root.dataset.theme;
  };
}
