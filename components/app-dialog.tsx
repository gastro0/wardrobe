"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useDialogBack } from "@/hooks/use-dialog-back";
import { useDialogViewport } from "@/hooks/use-dialog-viewport";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: () => void;
  title: string;
  closeLabel: string;
  className: string;
  busy?: boolean;
  dismissible?: boolean;
  footer?: ReactNode;
  children: ReactNode;
};

export default function AppDialog({ open, onOpenChange, onClosed, title, closeLabel,
  className, busy = false, dismissible = true, footer, children }: Props) {
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const changeOpen = useCallback((next: boolean) => {
    if (!next && (busy || !dismissible)) return;
    onOpenChange(next);
  }, [busy, dismissible, onOpenChange]);

  // Native Telegram Back must work even while the WebView has lost DOM focus.
  useDialogBack(true, useCallback(() => changeOpen(false), [changeOpen]));
  useDialogViewport(content);

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent ref={content} className={`app-dialog ${className}`} showCloseButton={false}
      onOpenAutoFocus={event => {
        event.preventDefault();
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        // Focus the title without opening the mobile keyboard or scrolling the page.
        heading.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        // A parent may replace this editor with another dialog (e.g. delete).
        if (open) return;
        if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        onClosed();
      }}>
      <header className="dialog-header">
        <DialogTitle ref={heading} tabIndex={-1} className="dialog-heading">{title}</DialogTitle>
        {dismissible && <DialogClose className="dialog-x" aria-label={closeLabel} disabled={busy}>
          <X size={20}/>
        </DialogClose>}
      </header>
      <div className="dialog-scroll" data-testid="dialog-scroll">{children}</div>
      {footer && <div className="dialog-footer">{footer}</div>}
    </DialogContent>
  </Dialog>;
}
