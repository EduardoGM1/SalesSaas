"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";

type ToastType = "success" | "error" | "info";
type Item = { id: number; msg: string; type: ToastType };

let _id = 0;

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    toast._register((msg, type) => {
      const id = ++_id;
      setItems((p) => [...p, { id, msg, type }]);
      const duration = type === "error" ? 4500 : 3000;
      setTimeout(() => setItems((p) => p.filter((i) => i.id !== id)), duration);
    });
  }, []);

  if (!items.length) return null;

  return (
    <div className="toaster">
      {items.map((item) => (
        <div key={item.id} className={`toast-item toast-${item.type}`}>
          {item.msg}
        </div>
      ))}
    </div>
  );
}
