"use client";

import { useEffect } from "react";
import { telegramApp } from "@/lib/telegram";

export function useTelegramNavigation(onBack: (() => void) | null, editing = false) {
  useEffect(() => {
    const app = telegramApp();
    if (!app?.isVersionAtLeast("6.1")) return;
    if (onBack) {
      app.BackButton.show();
      app.BackButton.onClick(onBack);
    } else app.BackButton.hide();
    if (app.isVersionAtLeast("6.2")) {
      if (editing) app.enableClosingConfirmation();
      else app.disableClosingConfirmation();
    }
    return () => {
      if (onBack) app.BackButton.offClick(onBack);
      app.BackButton.hide();
      if (app.isVersionAtLeast("6.2")) app.disableClosingConfirmation();
    };
  }, [onBack, editing]);
}
