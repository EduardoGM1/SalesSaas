"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

interface SalesModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  sub?: string;
  maxWidth?: number;
  children: React.ReactNode;
}

export function SalesModal({ open, onOpenChange, title, sub, maxWidth, children }: SalesModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="modal-backdrop" />
        <DialogPrimitive.Popup className="modal" style={maxWidth ? { maxWidth } : undefined}>
          <div className="modal-title">
            <DialogPrimitive.Title render={<span />}>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="modal-close" aria-label="Cerrar">✕</DialogPrimitive.Close>
          </div>
          {sub ? <DialogPrimitive.Description className="modal-sub">{sub}</DialogPrimitive.Description> : null}
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
