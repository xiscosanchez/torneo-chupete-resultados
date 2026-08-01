"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveLineup, type LineupPlayerInput } from "@/app/actions/lineup";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { FORMATIONS } from "@/lib/labels";
import type { LineupPlayer, PlayerPublic } from "@/lib/types";

interface Slot {
  x: number;
  y: number;
}

/** Posiciones (en %) de los 11 huecos según la formación. y=0 portería propia. */
function slotsFor(formacion: string): Slot[] {
  const lines = formacion.split("-").map((n) => parseInt(n, 10));
  const slots: Slot[] = [{ x: 50, y: 8 }]; // portero
  const yStep = 74 / lines.length;
  lines.forEach((count, i) => {
    const y = 22 + yStep * i + yStep / 2;
    for (let j = 0; j < count; j++) {
      const x = ((j + 1) * 100) / (count + 1);
      slots.push({ x, y });
    }
  });
  return slots;
}

export function LineupBoard({
  matchId,
  players,
  fotos,
  initialFormacion,
  initialLineupPlayers,
  editable,
}: {
  matchId: string;
  players: PlayerPublic[];
  fotos: Record<string, string>;
  initialFormacion: string;
  initialLineupPlayers: LineupPlayer[];
  editable: boolean;
}) {
  const router = useRouter();
  const [formacion, setFormacion] = useState(initialFormacion);
  const slots = useMemo(() => slotsFor(formacion), [formacion]);

  // slotIndex → playerId (titulares) a partir de la alineación guardada
  const [assignments, setAssignments] = useState<(string | null)[]>(() => {
    const arr: (string | null)[] = Array(11).fill(null);
    const starters = initialLineupPlayers.filter((lp) => lp.titular);
    const initSlots = slotsFor(initialFormacion);
    starters.forEach((lp) => {
      if (lp.pos_x == null || lp.pos_y == null) return;
      let best = -1;
      let bestDist = Infinity;
      initSlots.forEach((s, i) => {
        const d = (s.x - Number(lp.pos_x)) ** 2 + (s.y - Number(lp.pos_y)) ** 2;
        if (d < bestDist && arr[i] === null) {
          bestDist = d;
          best = i;
        }
      });
      if (best >= 0) arr[best] = lp.player_id;
    });
    return arr;
  });
  const [bench, setBench] = useState<string[]>(
    initialLineupPlayers.filter((lp) => !lp.titular).map((lp) => lp.player_id)
  );
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, PlayerPublic>();
    players.forEach((p) => m.set(p.id, p));
    return m;
  }, [players]);

  const assigned = new Set([...assignments.filter(Boolean), ...bench] as string[]);
  const available = players.filter((p) => !assigned.has(p.id));

  function pick(playerId: string) {
    if (pickingSlot === null) return;
    setAssignments((prev) => {
      const next = [...prev];
      // si ya estaba en otro hueco, lo quitamos
      const oldIdx = next.indexOf(playerId);
      if (oldIdx >= 0) next[oldIdx] = null;
      next[pickingSlot] = playerId;
      return next;
    });
    setBench((prev) => prev.filter((id) => id !== playerId));
    setPickingSlot(null);
  }

  function clearSlot(i: number) {
    setAssignments((prev) => {
      const next = [...prev];
      next[i] = null;
      return next;
    });
  }

  async function handleSave(notify: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const lineupPlayers: LineupPlayerInput[] = [];
      assignments.forEach((pid, i) => {
        if (pid)
          lineupPlayers.push({
            player_id: pid,
            titular: true,
            pos_x: slots[i].x,
            pos_y: slots[i].y,
          });
      });
      bench.forEach((pid) =>
        lineupPlayers.push({ player_id: pid, titular: false, pos_x: null, pos_y: null })
      );
      await saveLineup({ matchId, formacion, players: lineupPlayers, notify });
      setMsg(notify ? "Alineación guardada y notificada ✅" : "Alineación guardada ✅");
      router.refresh();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const starterCount = assignments.filter(Boolean).length;

  return (
    <div className="px-4 py-4 space-y-4">
      {editable && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-600">Formación:</span>
          <select
            value={formacion}
            onChange={(e) => {
              setFormacion(e.target.value);
            }}
            className="rounded-xl border border-slate-300 px-3 py-2 bg-white font-bold"
          >
            {FORMATIONS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <span className="ml-auto text-sm font-bold text-slate-500">
            {starterCount}/11
          </span>
        </div>
      )}

      {/* Campo */}
      <div
        className="relative w-full rounded-2xl overflow-hidden shadow"
        style={{ aspectRatio: "3 / 4", background: "linear-gradient(#15803d, #166534)" }}
      >
        {/* líneas del campo */}
        <div className="absolute inset-3 border-2 border-white/40 rounded" />
        <div className="absolute left-3 right-3 top-1/2 border-t-2 border-white/40" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-white/40 rounded-full" />
        <div className="absolute left-1/2 -translate-x-1/2 bottom-3 w-40 h-16 border-2 border-b-0 border-white/40" />
        <div className="absolute left-1/2 -translate-x-1/2 top-3 w-40 h-16 border-2 border-t-0 border-white/40" />

        {slots.map((s, i) => {
          const pid = assignments[i];
          const p = pid ? byId.get(pid) : null;
          return (
            <button
              key={i}
              type="button"
              disabled={!editable}
              onClick={() => (p ? clearSlot(i) : setPickingSlot(i))}
              className="absolute -translate-x-1/2 translate-y-1/2 flex flex-col items-center"
              style={{ left: `${s.x}%`, bottom: `${s.y}%` }}
            >
              {p ? (
                <>
                  <PlayerAvatar
                    url={p.foto_path ? fotos[p.foto_path] : null}
                    nombre={p.nombre}
                    apellidos={p.apellidos}
                    size={44}
                  />
                  <span className="mt-0.5 text-[10px] font-extrabold text-white bg-black/40 px-1.5 py-0.5 rounded-full max-w-[72px] truncate">
                    {p.dorsal != null ? `${p.dorsal} · ` : ""}
                    {p.nombre}
                  </span>
                </>
              ) : (
                <span
                  className={`w-11 h-11 rounded-full border-2 border-dashed border-white/60 flex items-center justify-center text-white/70 text-xl font-bold ${
                    editable ? "active:bg-white/20" : ""
                  }`}
                >
                  +
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Banquillo */}
      <section>
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">
          Banquillo ({bench.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {bench.map((pid) => {
            const p = byId.get(pid);
            if (!p) return null;
            return (
              <button
                key={pid}
                type="button"
                disabled={!editable}
                onClick={() => setBench((prev) => prev.filter((id) => id !== pid))}
                className="flex items-center gap-1.5 rounded-full bg-white shadow-sm pl-1 pr-3 py-1"
              >
                <PlayerAvatar
                  url={p.foto_path ? fotos[p.foto_path] : null}
                  nombre={p.nombre}
                  apellidos={p.apellidos}
                  size={28}
                />
                <span className="text-xs font-bold">{p.nombre}</span>
                {editable && <span className="text-slate-400 text-xs">✕</span>}
              </button>
            );
          })}
          {editable &&
            available.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setBench((prev) => [...prev, p.id])}
                className="flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 pl-1 pr-3 py-1 opacity-70"
              >
                <PlayerAvatar
                  url={p.foto_path ? fotos[p.foto_path] : null}
                  nombre={p.nombre}
                  apellidos={p.apellidos}
                  size={28}
                />
                <span className="text-xs font-bold">+ {p.nombre}</span>
              </button>
            ))}
        </div>
        {editable && (
          <p className="mt-1 text-[11px] text-slate-400">
            Toca un hueco del campo para poner titular · toca un jugador del campo para
            quitarlo · toca uno punteado para mandarlo al banquillo.
          </p>
        )}
      </section>

      {msg && <p className="text-sm font-semibold text-center text-slate-600">{msg}</p>}

      {editable && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleSave(false)}
            disabled={busy}
            className="rounded-xl border border-green-700 text-green-700 py-3 font-bold disabled:opacity-50"
          >
            Guardar
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={busy}
            className="rounded-xl bg-green-700 text-white py-3 font-bold active:bg-green-800 disabled:opacity-50"
          >
            Guardar y notificar
          </button>
        </div>
      )}

      {/* Selector de jugador para un hueco */}
      {pickingSlot !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end"
          onClick={() => setPickingSlot(null)}
        >
          <div
            className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-4 max-h-[70dvh] overflow-y-auto pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-extrabold mb-3">Elige jugador</h3>
            {available.length === 0 && bench.length === 0 && (
              <p className="text-sm text-slate-500">No quedan jugadores disponibles.</p>
            )}
            <ul className="space-y-1.5">
              {[...available, ...bench.map((id) => byId.get(id)!).filter(Boolean)].map(
                (p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pick(p.id)}
                      className="w-full flex items-center gap-3 rounded-xl p-2 active:bg-slate-100"
                    >
                      <PlayerAvatar
                        url={p.foto_path ? fotos[p.foto_path] : null}
                        nombre={p.nombre}
                        apellidos={p.apellidos}
                        size={36}
                      />
                      <span className="font-bold text-sm">
                        {p.nombre} {p.apellidos}
                        {p.dorsal != null && (
                          <span className="text-slate-400"> · {p.dorsal}</span>
                        )}
                      </span>
                      {bench.includes(p.id) && (
                        <span className="ml-auto text-[11px] font-bold text-slate-400">
                          banquillo
                        </span>
                      )}
                    </button>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
