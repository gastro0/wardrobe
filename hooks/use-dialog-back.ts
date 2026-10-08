"use client";

import { useEffect } from "react";

const handlers: Array<() => void> = [];

export function requestDialogBack() {
  handlers.at(-1)?.();
}

export function useDialogBack(active: boolean, onBack: () => void) {
  useEffect(() => {
    if (!active) return;
    handlers.push(onBack);
    return () => {
      const index = handlers.indexOf(onBack);
      if (index >= 0) handlers.splice(index, 1);
    };
  }, [active, onBack]);
}
