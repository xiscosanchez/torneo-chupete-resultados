"use client";

import { useRef, useState } from "react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { POSITION_LABELS } from "@/lib/labels";
import type { Player, PositionGroup } from "@/lib/types";

/** Comprime una imagen en el navegador a JPEG cuadrado de 512px. */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  const target = Math.min(512, side);
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    target,
    target
  );
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85)
  );
}

const inputCls =
  "mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base bg-white focus:outline-none focus:ring-2 focus:ring-green-600";
const labelCls = "block text-sm font-semibold text-slate-700";

export function PlayerForm({
  player,
  fotoUrl,
  action,
}: {
  player?: Player;
  fotoUrl?: string | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const [preview, setPreview] = useState<string | null>(fotoUrl ?? null);
  const [saving, setSaving] = useState(false);
  const fotoBlob = useRef<Blob | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await compressImage(file);
    fotoBlob.current = blob;
    setPreview(URL.createObjectURL(blob));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const formData = new FormData(e.currentTarget);
      formData.delete("foto_raw");
      if (fotoBlob.current) {
        formData.set("foto", fotoBlob.current, "foto.jpg");
      }
      await action(formData);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 px-4 pb-8">
      {player && <input type="hidden" name="id" value={player.id} />}

      <div className="flex items-center gap-4 pt-2">
        <PlayerAvatar
          url={preview}
          nombre={player?.nombre ?? "?"}
          apellidos={player?.apellidos}
          size={72}
        />
        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-xl border border-green-700 text-green-700 px-4 py-2 text-sm font-bold"
          >
            {preview ? "Cambiar foto" : "Añadir foto"}
          </button>
          <input
            ref={fileInput}
            type="file"
            name="foto_raw"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Nombre *
          <input name="nombre" required defaultValue={player?.nombre} className={inputCls} />
        </label>
        <label className={labelCls}>
          Apellidos
          <input name="apellidos" defaultValue={player?.apellidos} className={inputCls} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          DNI
          <input name="dni" defaultValue={player?.dni ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          Fecha de nacimiento
          <input
            type="date"
            name="fecha_nacimiento"
            defaultValue={player?.fecha_nacimiento ?? ""}
            className={inputCls}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Demarcación *
          <select
            name="demarcacion"
            defaultValue={player?.demarcacion ?? "CEN"}
            className={inputCls}
          >
            {(Object.keys(POSITION_LABELS) as PositionGroup[]).map((k) => (
              <option key={k} value={k}>
                {POSITION_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Subposición
          <input
            name="subposicion"
            placeholder="Lateral dcho, MC…"
            defaultValue={player?.subposicion ?? ""}
            className={inputCls}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Dorsal
          <input
            type="number"
            name="dorsal"
            min={1}
            max={99}
            defaultValue={player?.dorsal ?? ""}
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          Teléfono
          <input type="tel" name="telefono" defaultValue={player?.telefono ?? ""} className={inputCls} />
        </label>
      </div>

      <label className={labelCls}>
        Email (para invitarle a la app)
        <input type="email" name="email" defaultValue={player?.email ?? ""} className={inputCls} />
      </label>

      <label className={labelCls}>
        Notas
        <textarea name="notas" rows={2} defaultValue={player?.notas ?? ""} className={inputCls} />
      </label>

      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          type="checkbox"
          name="activo"
          defaultChecked={player?.activo ?? true}
          className="w-5 h-5 accent-green-700"
        />
        Jugador activo en plantilla
      </label>

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-green-700 py-3 font-bold text-white active:bg-green-800 disabled:opacity-60"
      >
        {saving ? "Guardando…" : "Guardar jugador"}
      </button>
    </form>
  );
}
