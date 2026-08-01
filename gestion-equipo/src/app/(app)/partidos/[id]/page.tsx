import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ClipboardList,
  MapPin,
  Pencil,
  PlayCircle,
  Shirt,
  Timer,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  CALLUP_STATUS_LABELS,
  EVENT_ICONS,
  EVENT_LABELS,
  MATCH_STATUS_LABELS,
  MATCH_TYPE_COLORS,
  MATCH_TYPE_LABELS,
} from "@/lib/labels";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type {
  Callup,
  CallupPlayer,
  EventType,
  Match,
  MatchEvent,
  PlayerPublic,
} from "@/lib/types";

const STAT_TYPES: EventType[] = [
  "gol",
  "tiro",
  "tiro_puerta",
  "corner",
  "falta",
  "fuera_juego",
  "penalti",
  "amarilla",
  "roja",
];

export default async function PartidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const isCoach = profile.role === "entrenador";

  const { data: matchData } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!matchData) notFound();
  const match = matchData as Match;

  const [{ data: callupData }, { data: eventsData }, { data: playersData }] =
    await Promise.all([
      supabase.from("callups").select("*").eq("match_id", id).maybeSingle(),
      supabase
        .from("match_events")
        .select("*")
        .eq("match_id", id)
        .order("minuto", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("players_public").select("id, nombre, apellidos, dorsal"),
    ]);

  const callup = callupData as Callup | null;
  const events = (eventsData ?? []) as MatchEvent[];
  const players = (playersData ?? []) as Pick<
    PlayerPublic,
    "id" | "nombre" | "apellidos" | "dorsal"
  >[];
  const playerName = (pid: string | null) => {
    if (!pid) return null;
    const p = players.find((x) => x.id === pid);
    return p ? `${p.nombre} ${p.apellidos}`.trim() : null;
  };

  let callupPlayers: CallupPlayer[] = [];
  if (callup) {
    const { data } = await supabase
      .from("callup_players")
      .select("*")
      .eq("callup_id", callup.id);
    callupPlayers = (data ?? []) as CallupPlayer[];
  }
  const accepted = callupPlayers.filter((c) => c.estado === "aceptada").length;
  const pending = callupPlayers.filter((c) => c.estado === "pendiente").length;

  const fecha = new Date(match.fecha);
  const showScore = match.estado === "en_juego" || match.estado === "finalizado";

  const statRows = STAT_TYPES.map((t) => ({
    tipo: t,
    favor: events.filter((e) => e.tipo === t && e.equipo === "favor").length,
    contra: events.filter((e) => e.tipo === t && e.equipo === "contra").length,
  })).filter((r) => r.favor > 0 || r.contra > 0);

  return (
    <>
      <PageHeader
        title="Partido"
        backHref="/calendario"
        action={
          isCoach ? (
            <Link
              href={`/partidos/${id}/editar`}
              className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold"
            >
              <Pencil size={14} /> Editar
            </Link>
          ) : undefined
        }
      />

      <main className="px-4 py-4 space-y-4">
        {/* Cabecera del partido */}
        <section className="rounded-2xl bg-white p-4 shadow-sm text-center">
          <div className="flex justify-center gap-2">
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${MATCH_TYPE_COLORS[match.tipo]}`}
            >
              {MATCH_TYPE_LABELS[match.tipo]}
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                match.estado === "en_juego"
                  ? "bg-red-100 text-red-700 animate-pulse"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {MATCH_STATUS_LABELS[match.estado]}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 items-center">
            <p className="font-extrabold text-lg leading-tight">
              {match.es_local ? "Nosotros" : match.rival}
            </p>
            <p className="text-4xl font-extrabold">
              {showScore
                ? match.es_local
                  ? `${match.goles_favor}-${match.goles_contra}`
                  : `${match.goles_contra}-${match.goles_favor}`
                : "vs"}
            </p>
            <p className="font-extrabold text-lg leading-tight">
              {match.es_local ? match.rival : "Nosotros"}
            </p>
          </div>

          <p className="mt-2 text-sm text-slate-500 font-semibold capitalize">
            {format(fecha, "EEEE d 'de' MMMM · HH:mm", { locale: es })}
          </p>
          {match.lugar && (
            <p className="text-sm text-slate-500 font-semibold">
              <MapPin size={13} className="inline -mt-0.5" /> {match.lugar}
            </p>
          )}
          {match.notas && <p className="mt-2 text-sm text-slate-600">{match.notas}</p>}
        </section>

        {/* Accesos */}
        <section className="grid grid-cols-3 gap-2">
          <HubLink
            href={`/partidos/${id}/convocatoria`}
            icon={<ClipboardList size={22} />}
            label="Convocatoria"
            sub={
              callup?.published_at
                ? `${accepted}✓ ${pending} pdte.`
                : isCoach
                  ? "Crear"
                  : "—"
            }
          />
          <HubLink
            href={`/partidos/${id}/alineacion`}
            icon={<Shirt size={22} />}
            label="Alineación"
            sub={isCoach ? "Pizarra" : "Ver"}
          />
          <HubLink
            href={`/partidos/${id}/directo`}
            icon={
              match.estado === "en_juego" ? <Timer size={22} /> : <PlayCircle size={22} />
            }
            label={match.estado === "en_juego" ? "En directo" : "Directo"}
            sub={isCoach ? "Estadísticas" : "Seguir"}
            highlight={match.estado === "en_juego"}
          />
        </section>

        {/* Convocatoria: estado de respuestas */}
        {callup?.published_at && callupPlayers.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-extrabold mb-2">Convocados ({callupPlayers.length})</h2>
            <ul className="space-y-1.5">
              {callupPlayers.map((cp) => (
                <li key={cp.id} className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{playerName(cp.player_id) ?? "Jugador"}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      cp.estado === "aceptada"
                        ? "bg-emerald-100 text-emerald-700"
                        : cp.estado === "rechazada"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {CALLUP_STATUS_LABELS[cp.estado]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Estadísticas del partido */}
        {statRows.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-extrabold mb-2">Estadísticas</h2>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-y-1.5 text-sm items-center">
              <p className="font-bold text-center text-slate-500 text-xs">NOSOTROS</p>
              <p />
              <p className="font-bold text-center text-slate-500 text-xs">{match.rival.toUpperCase()}</p>
              {statRows.map((r) => (
                <StatRow key={r.tipo} row={r} />
              ))}
            </div>
          </section>
        )}

        {/* Cronología */}
        {events.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-extrabold mb-2">Cronología</h2>
            <ul className="space-y-1.5 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <span className="w-9 text-right font-bold text-slate-400">{e.minuto}&apos;</span>
                  <span>{EVENT_ICONS[e.tipo]}</span>
                  <span className="font-semibold">
                    {EVENT_LABELS[e.tipo]}
                    {e.equipo === "contra" ? ` (${match.rival})` : ""}
                  </span>
                  {playerName(e.player_id) && (
                    <span className="text-slate-500">· {playerName(e.player_id)}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

function HubLink({
  href,
  icon,
  label,
  sub,
  highlight,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1 text-center active:opacity-80 ${
        highlight ? "bg-red-600 text-white" : "bg-white text-green-800"
      }`}
    >
      {icon}
      <span className="text-xs font-extrabold">{label}</span>
      {sub && (
        <span className={`text-[10px] font-semibold ${highlight ? "text-red-100" : "text-slate-400"}`}>
          {sub}
        </span>
      )}
    </Link>
  );
}

function StatRow({
  row,
}: {
  row: { tipo: EventType; favor: number; contra: number };
}) {
  return (
    <>
      <p className="text-center font-extrabold">{row.favor}</p>
      <p className="text-center text-slate-500 font-semibold px-3">
        {EVENT_ICONS[row.tipo]} {EVENT_LABELS[row.tipo]}
      </p>
      <p className="text-center font-extrabold">{row.contra}</p>
    </>
  );
}
