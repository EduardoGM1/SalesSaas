"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createEmptyClient, useDbStore } from "@/stores/db-store";

function NewClientInner() {
  const router = useRouter();
  const params = useSearchParams();
  const saveClient = useDbStore((s) => s.saveClient);

  useEffect(() => {
    const tourDate = params.get("tourDate") || undefined;
    const name = prompt("Nombre del cliente:");
    if (!name?.trim()) { router.push("/clients"); return; }
    const c = createEmptyClient(name.trim(), tourDate);
    if (params.get("sale") === "1") {
      c.quickExpedient = true;
      c.completedExpedient = false;
    }
    saveClient(c);
    router.replace(`/clients/${c.id}`);
  }, [params, router, saveClient]);

  return <div className="p-7 text-muted-foreground">Creando expediente...</div>;
}

export default function NewClientPage() {
  return (
    <Suspense fallback={<div className="p-7">Cargando...</div>}>
      <NewClientInner />
    </Suspense>
  );
}
