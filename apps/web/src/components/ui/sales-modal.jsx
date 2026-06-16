
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

interface SalesModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title;
  sub?;
  maxWidth?: number;
  popupId?;
  modalClassName?;
  children;
}

export function SalesModal({ open, onOpenChange, title, sub, maxWidth, popupId, modalClassName, children }: SalesModalProps) {
  const modalStyle = maxWidth
    ? { maxWidth: `min(${maxWidth}px, calc(100vw - 40px))`, width: "100%", boxSizing: "border-box" }
    : undefined;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="modal-backdrop sales-modal-overlay" />
        <DialogPrimitive.Viewport className="sales-modal-viewport">
          <DialogPrimitive.Popup id={popupId} className={["modal", modalClassName].filter(Boolean).join(" ")} style={modalStyle}>
            <div className="modal-title">
              <DialogPrimitive.Title render={<span />}>{title}</DialogPrimitive.Title>
              <DialogPrimitive.Close className="modal-close" aria-label="Cerrar">✕</DialogPrimitive.Close>
            </div>
            {sub ? <DialogPrimitive.Description className="modal-sub">{sub}</DialogPrimitive.Description> : null}
            {children}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
