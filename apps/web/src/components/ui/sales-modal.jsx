
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

interface SalesModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title;
  sub?;
  maxWidth?: number;
  popupId?;
  children;
}

export function SalesModal({ open, onOpenChange, title, sub, maxWidth, popupId, children }: SalesModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="modal-backdrop sales-modal-overlay" />
        <DialogPrimitive.Viewport className="sales-modal-viewport">
          <DialogPrimitive.Popup id={popupId} className="modal" style={maxWidth ? { maxWidth } : undefined}>
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
