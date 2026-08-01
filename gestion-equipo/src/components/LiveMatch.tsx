"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addEvent, undoEvent } from "@/app/actions/events";
import { setMatchStatus } from "@/app/actions/matches";
import { createClient } from "@/lib/supabase/client";
import { EVENT_ICONS, EVENT_LABELS } from "@/lib/labels";
import type {
  EventTeam,
  EventType,
  Match,
  MatchEvent,
  PlayerPublic,
} from "@/lib/types";

const BUTTONS: EventType[] = [
  "gol",
  "tiro",
  "tiro_puerta",
  "corner",
  "falta",
  "fuera_juego",
  "penalti",
  "amarilla",
  "roja",
  "cambio",
];

/** Cronómetro persistido en localStorage para sobrevivir a recargas. */
function useChrono(matchId: string) {
  const key = `chrono-${matchId}`;
  const [state, setState] = useState<{ startedAt: number | null; offset: number }>({
    startedAt: null,
    offset: 0,
  });
  const [, forceTick] = useState(0);

  useEffect(() => {
    const raw = localStorage.getItem(key);
    if (raw) setState(JSON.parse(raw));
  }, [key]);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed =
    state.offset + (state.startedAt ? Date.now() - state.startedAt : 0);

  function persist(next: typeof state) {
    setState(next);
    localStorage.setItem(key, JSON.stringify(next));
  }

  return {
    running: state.startedAt !== null,
    minutes: Math.floor(elapsed / 60000),
    seconds: Math.floor((elapsed % 60000) / 1000),
    start: () => persist({ ...state, startedAt: Date.now() }),
    pause: () =>
      persist({
        startedAt: null,
        offset: state.offset + (state.startedAt ? Date.now() - state.startedAt : 0),
      }),
    reset: () => persist({ startedAt: null, offset: 0 }),
  };
}

export function LiveMatch({
  match: initialMatch,
  events: initialEvents,
  players,
  isCoach,
}: {
  match: Match;
  events: MatchEvent[];
  players: PlayerPublic[];
  isCoach: boolean;
}) {
  const router = useRouter();
  const [match, setMatch] = useState(initialMatch);
  const [events, setEvents] = useState(initialEvents);
  const [team, setTeam] = useState<EventTeam>("favor");
  const [pendingEvent, setPendingEvent] = useState<EventType | null>(null);
  const [busy, setBusy] = useState(false);
  const chrono = useChrono(match.id);
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Tiempo real: eventos y marcador para cualquiera que mire el partido
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-${match.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_events",
          filter: `match_id=eq.${match.id}`,
        },
        (payload) => {
          const ev = payload.new as MatchEvent;
          if (!eventsRef.current.some((e) => e.id === ev.id)) {
            setEvents((prev) => [...prev, ev]);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "match_events",
        },
        (payload) => {
          const oldId = (payload.old as { id?: string }).id;
          if (oldId) setEvents((prev) => prev.filter((e) => e.id !== oldId));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${match.id}`,
        },
        (payload) => setMatch((prev) => ({ ...prev, ...(payload.new as Match) }))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [match.id]);

  const playerName = useMemo(() => {
    const m = new Map(players.map((p) => [p.id, `${p.nombre} ${p.apellidos}`.trim()]));
    return (id: string | null) => (id ? (m.get(id) ?? null) : null);
  }, [players]);

  async function fireEvent(tipo: EventType, playerId?: string | null) {
    setBusy(true);
    try {
      const ev = await addEvent({
        matchId: match.id,
        minuto: Math.max(1, chrono.minutes + 1),
        equipo: team,
        tipo,
        playerId,
      });
      setEvents((prev) =>
        prev.some((e) => e.id === ev.id) ? prev : [...prev, ev]
      );
      if (tipo === "gol") {
        setMatch((prev) => ({
          ...prev,
          goles_favor: prev.goles_favor + (team === "favor" ? 1 : 0),
          goles_contra: prev.goles_contra + (team === "contra" ? 1 : 0),
        }));
      }
    } finally {
      setBusy(false);
      setPendingEvent(null);
    }
  }

  async function handleUndo() {
    const last = events[events.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      await undoEvent(last.id);
      setEvents((prev) => prev.filter((e) => e.id !== last.id));
      if (last.tipo === "gol") {
        setMatch((prev) => ({
          ...prev,
          goles_favor: Math.max(0, prev.goles_favor - (last.equipo === "favor" ? 1 : 0)),
          goles_contra: Math.max(
            0,
            prev.goles_contra - (last.equipo === "contra" ? 1 : 0)
          ),
        }));
      }
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(estado: string) {
    const fd = new FormData();
    fd.set("id", match.id);
    fd.set("estado", estado);
    await setMatchStatus(fd);
    setMatch((prev) => ({ ...prev, estado: estado as Match["estado"] }));
    if (estado === "en_juego" && !chrono.running) chrono.start();
    if (estado === "finalizado") chrono.pause();
    router.refresh();
  }

  const live = match.estado === "en_juego";

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Marcador */}
      <section className="rounded-2xl bg-slate-900 text-white p-4 text-center">
        <div className="grid grid-cols-3 items-center">
          <p className="font-extrabold leading-tight">Nosotros</p>
          <p className="text-5xl font-extrabold tabular-nums">
            {match.goles_favor}-{match.goles_contra}
          </p>
          <p className="font-extrabold leading-tight">{match.rival}</p>
        </div>
        <p className="mt-2 text-2xl font-extrabold tabular-nums text-green-400">
          {String(chrono.minutes).padStart(2, "0")}:
          {String(chrono.seconds).padStart(2, "0")}
        </p>
        {isCoach && (
          <div className="mt-3 flex justify-center gap-2">
            {!live && match.estado === "programado" && (
              <button
                onClick={() => changeStatus("en_juego")}
                className="rounded-full bg-green-600 px-5 py-2 font-bold text-sm"
              >
                ▶ Empezar partido
              </button>
            )}
            {live && (
              <>
                <button
                  onClick={() => (chrono.running ? chrono.pause() : chrono.start())}
                  className="rounded-full bg-white/15 px-4 py-2 font-bold text-sm"
                >
                  {chrono.running ? "⏸ Pausar" : "▶ Reanudar"}
                </button>
                <button
                  onClick={() => changeStatus("finalizado")}
                  className="rounded-full bg-red-600 px-4 py-2 font-bold text-sm"
                >
                  ⏹ Finalizar
                </button>
              </>
            )}
            {match.estado === "finalizado" && (
              <button
                onClick={() => changeStatus("en_juego")}
                className="rounded-full bg-white/15 px-4 py-2 font-bold text-sm"
              >
                Reabrir partido
              </button>
            )}
          </div>
        )}
      </section>

      {/* Botonera de eventos */}
      {isCoach && (
        <>
          <div className="grid grid-cols-2 rounded-xl overflow-hidden border-2 border-slate-300 font-extrabold text-sm">
            <button
              onClick={() => setTeam("favor")}
              className={`py-2.5 ${team === "favor" ? "bg-green-700 text-white" : "bg-white text-slate-500"}`}
            >
              A FAVOR
            </button>
            <button
              onClick={() => setTeam("contra")}
              className={`py-2.5 ${team === "contra" ? "bg-red-600 text-white" : "bg-white text-slate-500"}`}
            >
              EN CONTRA ({match.rival})
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {BUTTONS.map((t) => (
              <button
                key={t}
                disabled={busy || !live}
                onClick={() => {
                  // A favor: se puede asignar jugador. En contra: directo.
                  if (team === "favor" && players.length > 0) setPendingEvent(t);
                  else fireEvent(t);
                }}
                className={`rounded-2xl py-4 font-extrabold text-sm shadow-sm active:scale-95 transition disabled:opacity-40 ${
                  t === "gol"
                    ? "bg-green-700 text-white col-span-2 text-lg py-5"
                    : "bg-white text-slate-700"
                }`}
              >
                {EVENT_ICONS[t]} {EVENT_LABELS[t].toUpperCase()}
              </button>
            ))}
          </div>

          {events.length > 0 && live && (
            <button
              onClick={handleUndo}
              disabled={busy}
              className="w-full rounded-xl border border-slate-300 py-2.5 font-bold text-sm text-slate-500 disabled:opacity-50"
            >
              ↩ Deshacer último ({EVENT_LABELS[events[events.length - 1].tipo]})
            </button>
          )}

          {!live && match.estado === "programado" && (
            <p className="text-center text-sm text-slate-400 font-semibold">
              Pulsa “Empezar partido” para registrar eventos.
            </p>
          )}
        </>
      )}

      {/* Cronología en vivo */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-extrabold mb-2">Cronología</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">Sin eventos todavía.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="w-9 text-right font-bold text-slate-400">
                  {e.minuto}&apos;
                </span>
                <span>{EVENT_ICONS[e.tipo]}</span>
                <span
                  className={`font-semibold ${e.equipo === "contra" ? "text-red-600" : ""}`}
                >
                  {EVENT_LABELS[e.tipo]}
                  {e.equipo === "contra" ? ` (${match.rival})` : ""}
                </span>
                {playerName(e.player_id) && (
                  <span className="text-slate-500 truncate">
                    · {playerName(e.player_id)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Selector de jugador para el evento */}
      {pendingEvent && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end"
          onClick={() => setPendingEvent(null)}
        >
          <div
            className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-4 max-h-[70dvh] overflow-y-auto pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-extrabold mb-1">
              {EVENT_ICONS[pendingEvent]} {EVENT_LABELS[pendingEvent]} — ¿de quién?
            </h3>
            <button
              onClick={() => fireEvent(pendingEvent, null)}
              className="w-full rounded-xl bg-slate-100 py-3 font-bold text-sm mb-2"
            >
              Sin asignar jugador
            </button>
            <ul className="space-y-1">
              {players.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => fireEvent(pendingEvent, p.id)}
                    className="w-full text-left rounded-xl px-3 py-2.5 font-bold text-sm active:bg-slate-100"
                  >
                    {p.dorsal != null ? `${p.dorsal} · ` : ""}
                    {p.nombre} {p.apellidos}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
