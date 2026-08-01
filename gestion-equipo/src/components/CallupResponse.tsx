"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondCallup } from "@/app/actions/callups";

export function CallupResponse({
  callupPlayerId,
  estado,
}: {
  callupPlayerId: string;
  estado: "pendiente" | "aceptada" | "rechazada";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function answer(e: "aceptada" | "rechazada") {
    setBusy(true);
    try {
      await respondCallup(callupPlayerId, e, e === "rechazada" ? motivo : undefined);
      setRejecting(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (rejecting) {
    return (
      <div className="mt-3 space-y-2">
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (lesión, trabajo…)"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm bg-white"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setRejecting(false)}
            className="rounded-xl border border-slate-300 py-2.5 font-bold text-sm text-slate-600"
          >
            Volver
          </button>
          <button
            onClick={() => answer("rechazada")}
            disabled={busy}
            className="rounded-xl bg-red-600 py-2.5 font-bold text-sm text-white disabled:opacity-50"
          >
            Confirmar rechazo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button
        onClick={() => setRejecting(true)}
        disabled={busy}
        className={`rounded-xl py-2.5 font-bold text-sm disabled:opacity-50 ${
          estado === "rechazada"
            ? "bg-red-600 text-white"
            : "border border-red-300 text-red-600"
        }`}
      >
        ✕ No puedo ir
      </button>
      <button
        onClick={() => answer("aceptada")}
        disabled={busy || estado === "aceptada"}
        className={`rounded-xl py-2.5 font-bold text-sm disabled:opacity-70 ${
          estado === "aceptada"
            ? "bg-emerald-600 text-white"
            : "bg-green-700 text-white active:bg-green-800"
        }`}
      >
        {estado === "aceptada" ? "✓ Aceptada" : "✓ Acepto"}
      </button>
    </div>
  );
}
