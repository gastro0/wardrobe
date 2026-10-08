"use client";

import { useEffect, type RefObject } from "react";

export function useDialogViewport(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const dialog = ref.current;
        if (!dialog || !viewport) return;
        dialog.style.setProperty("--dialog-viewport-height", `${viewport.height}px`);
        dialog.style.setProperty("--dialog-viewport-top", `${viewport.offsetTop}px`);
      });
    }
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [ref]);
}
