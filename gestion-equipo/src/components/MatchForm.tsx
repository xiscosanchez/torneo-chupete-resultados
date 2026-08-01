"use client";

import { useState } from "react";
import { MATCH_TYPE_LABELS } from "@/lib/labels";
import type { Match, MatchType } from "@/lib/types";

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-600";
const labelCls = "block text-sm font-semibold text-slate-700";

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MatchForm({
  match,
  action,
}: {
  match?: Match;
  action: (formData: FormData) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await action(new FormData(e.currentTarget));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 px-4 pb-8 pt-4">
      {match && <input type="hidden" name="id" value={match.id} />}

      <label className={labelCls}>
        Rival *
        <input name="rival" required defaultValue={match?.rival} className={inputCls} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Competición *
          <select name="tipo" defaultValue={match?.tipo ?? "liga"} className={inputCls}>
            {(Object.keys(MATCH_TYPE_LABELS) as MatchType[]).map((t) => (
              <option key={t} value={t}>
                {MATCH_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Fecha y hora *
          <input
            type="datetime-local"
            name="fecha"
            required
            defaultValue={match ? toLocalInputValue(match.fecha) : ""}
            className={inputCls}
          />
        </label>
      </div>

      <label className={labelCls}>
        Lugar
        <input
          name="lugar"
          placeholder="Campo municipal…"
          defaultValue={match?.lugar ?? ""}
          className={inputCls}
        />
      </label>

      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          name="es_local"
          defaultChecked={match?.es_local ?? true}
          className="w-5 h-5 accent-green-700"
        />
        Jugamos en casa
      </label>

      <label className={labelCls}>
        Notas
        <textarea name="notas" rows={2} defaultValue={match?.notas ?? ""} className={inputCls} />
      </label>

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-green-700 py-3 font-bold text-white active:bg-green-800 disabled:opacity-60"
      >
        {saving ? "Guardando…" : "Guardar partido"}
      </button>
    </form>
  );
}
