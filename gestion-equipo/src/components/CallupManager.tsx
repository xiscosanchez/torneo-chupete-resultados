"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { publishCallup, remindPending } from "@/app/actions/callups";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { createClient } from "@/lib/supabase/client";
import { CALLUP_STATUS_LABELS, POSITION_LABELS } from "@/lib/labels";
import type { CallupPlayer, PlayerPublic, PositionGroup } from "@/lib/types";

const ORDER: PositionGroup[] = ["POR", "DEF", "CEN", "DEL"];

export function CallupManager({
  matchId,
  players,
  fotos,
  callupPlayers: initialCallupPlayers,
  published,
  deadline,
  notas,
}: {
  matchId: string;
  players: PlayerPublic[];
  fotos: Record<string, string>;
  callupPlayers: CallupPlayer[];
  published: boolean;
  deadline: string | null;
  notas: string | null;
}) {
  const router = useRouter();
  const [callupPlayers, setCallupPlayers] = useState(initialCallupPlayers);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialCallupPlayers.map((c) => c.player_id))
  );
  const [notasVal, setNotasVal] = useState(notas ?? "");
  const [deadlineVal, setDeadlineVal] = useState(
    deadline ? deadline.slice(0, 16) : ""
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Respuestas en tiempo real
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`callup-${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "callup_players" },
        (payload) => {
          const updated = payload.new as CallupPlayer;
          setCallupPlayers((prev) =>
            prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const statusByPlayer = useMemo(() => {
    const m = new Map<string, CallupPlayer>();
    callupPlayers.forEach((c) => m.set(c.player_id, c));
    return m;
  }, [callupPlayers]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePublish() {
    setBusy(true);
    setMsg(null);
    try {
      await publishCallup({
        matchId,
        playerIds: [...selected],
        deadline: deadlineVal ? new Date(deadlineVal).toISOString() : null,
        notas: notasVal.trim() || null,
      });
      setMsg("Convocatoria publicada y notificada ✅");
      router.refresh();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemind() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await remindPending(matchId);
      setMsg(`Recordatorio enviado (${res.sent} notificaciones)`);
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const counts = {
    aceptada: callupPlayers.filter((c) => c.estado === "aceptada").length,
    pendiente: callupPlayers.filter((c) => c.estado === "pendiente").length,
    rechazada: callupPlayers.filter((c) => c.estado === "rechazada").length,
  };

  return (
    <div className="px-4 py-4 space-y-4">
      {published && (
        <div className="rounded-2xl bg-white p-3 shadow-sm grid grid-cols-3 text-center">
          <div>
            <p className="text-2xl font-extrabold text-emerald-600">{counts.aceptada}</p>
            <p className="text-[11px] font-bold text-slate-400">ACEPTADAS</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-amber-500">{counts.pendiente}</p>
            <p className="text-[11px] font-bold text-slate-400">PENDIENTES</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-red-500">{counts.rechazada}</p>
            <p className="text-[11px] font-bold text-slate-400">RECHAZADAS</p>
          </div>
        </div>
      )}

      <p className="text-sm font-semibold text-slate-600">
        Selecciona los convocados ({selected.size}):
      </p>

      {ORDER.map((g) => {
        const items = players.filter((p) => p.demarcacion === g);
        if (items.length === 0) return null;
        return (
          <section key={g}>
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">
              {POSITION_LABELS[g]}s
            </h2>
            <ul className="space-y-1.5">
              {items.map((p) => {
                const st = statusByPlayer.get(p.id);
                const isSel = selected.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={`w-full flex items-center gap-3 rounded-2xl p-2.5 text-left border-2 ${
                        isSel ? "bg-green-50 border-green-600" : "bg-white border-transparent"
                      } shadow-sm`}
                    >
                      <PlayerAvatar
                        url={p.foto_path ? fotos[p.foto_path] : null}
                        nombre={p.nombre}
                        apellidos={p.apellidos}
                        size={40}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate text-sm">
                          {p.nombre} {p.apellidos}
                          {p.dorsal != null && (
                            <span className="text-slate-400"> · {p.dorsal}</span>
                          )}
                        </p>
                        {!p.profile_id && (
                          <p className="text-[11px] text-amber-600 font-semibold">
                            Sin cuenta: no recibirá push
                          </p>
                        )}
                      </div>
                      {st && published && (
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            st.estado === "aceptada"
                              ? "bg-emerald-100 text-emerald-700"
                              : st.estado === "rechazada"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                          title={st.motivo ?? undefined}
                        >
                          {CALLUP_STATUS_LABELS[st.estado]}
                        </span>
                      )}
                      <span
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-white text-sm font-bold ${
                          isSel ? "bg-green-600 border-green-600" : "border-slate-300"
                        }`}
                      >
                        {isSel ? "✓" : ""}
                      </span>
                    </button>
                    {st?.estado === "rechazada" && st.motivo && (
                      <p className="text-xs text-red-600 mt-0.5 ml-14">Motivo: {st.motivo}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <label className="block text-sm font-semibold text-slate-700">
        Fecha límite para responder
        <input
          type="datetime-local"
          value={deadlineVal}
          onChange={(e) => setDeadlineVal(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 bg-white"
        />
      </label>

      <label className="block text-sm font-semibold text-slate-700">
        Notas para los convocados
        <textarea
          rows={2}
          value={notasVal}
          onChange={(e) => setNotasVal(e.target.value)}
          placeholder="Quedamos 1h antes en el campo…"
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 bg-white"
        />
      </label>

      {msg && <p className="text-sm font-semibold text-center text-slate-600">{msg}</p>}

      <button
        onClick={handlePublish}
        disabled={busy || selected.size === 0}
        className="w-full rounded-xl bg-green-700 py-3 font-bold text-white active:bg-green-800 disabled:opacity-50"
      >
        {busy
          ? "Enviando…"
          : published
            ? "Actualizar convocatoria y notificar nuevos"
            : `Publicar convocatoria y notificar (${selected.size})`}
      </button>

      {published && counts.pendiente > 0 && (
        <button
          onClick={handleRemind}
          disabled={busy}
          className="w-full rounded-xl border border-amber-500 text-amber-600 py-3 font-bold disabled:opacity-50"
        >
          ⏰ Recordar a los {counts.pendiente} pendientes
        </button>
      )}
    </div>
  );
}
