import { PageHeader } from "@/components/PageHeader";
import { EVENT_ICONS, EVENT_LABELS } from "@/lib/labels";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type { EventType, Match, MatchEvent, PlayerPublic } from "@/lib/types";

const TEAM_STATS: EventType[] = [
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

export default async function EstadisticasPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: matchesData }, { data: eventsData }, { data: playersData }] =
    await Promise.all([
      supabase.from("matches").select("*").eq("estado", "finalizado"),
      supabase.from("match_events").select("*"),
      supabase.from("players_public").select("*"),
    ]);

  const matches = (matchesData ?? []) as Match[];
  const finishedIds = new Set(matches.map((m) => m.id));
  const events = ((eventsData ?? []) as MatchEvent[]).filter((e) =>
    finishedIds.has(e.match_id)
  );
  const players = (playersData ?? []) as PlayerPublic[];

  const wins = matches.filter((m) => m.goles_favor > m.goles_contra).length;
  const draws = matches.filter((m) => m.goles_favor === m.goles_contra).length;
  const losses = matches.length - wins - draws;
  const gf = matches.reduce((s, m) => s + m.goles_favor, 0);
  const gc = matches.reduce((s, m) => s + m.goles_contra, 0);

  const teamRows = TEAM_STATS.map((t) => ({
    tipo: t,
    favor: events.filter((e) => e.tipo === t && e.equipo === "favor").length,
    contra: events.filter((e) => e.tipo === t && e.equipo === "contra").length,
  })).filter((r) => r.favor > 0 || r.contra > 0);

  const playerRows = players
    .map((p) => {
      const mine = events.filter((e) => e.player_id === p.id && e.equipo === "favor");
      return {
        p,
        goles: mine.filter((e) => e.tipo === "gol").length,
        amarillas: mine.filter((e) => e.tipo === "amarilla").length,
        rojas: mine.filter((e) => e.tipo === "roja").length,
        total: mine.length,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.goles - a.goles || b.total - a.total);

  return (
    <>
      <PageHeader title="Estadísticas de temporada" />
      <main className="px-4 py-4 space-y-4">
        {/* Balance */}
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-extrabold mb-3">
            Balance ({matches.length} partidos finalizados)
          </h2>
          <div className="grid grid-cols-3 text-center mb-3">
            <div>
              <p className="text-2xl font-extrabold text-emerald-600">{wins}</p>
              <p className="text-[11px] font-bold text-slate-400">VICTORIAS</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-slate-500">{draws}</p>
              <p className="text-[11px] font-bold text-slate-400">EMPATES</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-red-500">{losses}</p>
              <p className="text-[11px] font-bold text-slate-400">DERROTAS</p>
            </div>
          </div>
          <p className="text-center text-sm font-bold text-slate-600">
            Goles: {gf} a favor · {gc} en contra
          </p>
        </section>

        {/* Totales por tipo de evento */}
        {teamRows.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-extrabold mb-2">Equipo</h2>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-y-1.5 text-sm items-center">
              <p className="font-bold text-center text-slate-500 text-xs">A FAVOR</p>
              <p />
              <p className="font-bold text-center text-slate-500 text-xs">EN CONTRA</p>
              {teamRows.map((r) => (
                <StatTriple key={r.tipo} tipo={r.tipo} favor={r.favor} contra={r.contra} />
              ))}
            </div>
          </section>
        )}

        {/* Por jugador */}
        {playerRows.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="font-extrabold mb-2">Jugadores</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-bold text-slate-400 text-left">
                  <th className="pb-1">JUGADOR</th>
                  <th className="pb-1 text-center">⚽</th>
                  <th className="pb-1 text-center">🟨</th>
                  <th className="pb-1 text-center">🟥</th>
                </tr>
              </thead>
              <tbody>
                {playerRows.map((r) => (
                  <tr key={r.p.id} className="border-t border-slate-100">
                    <td className="py-1.5 font-bold">
                      {r.p.dorsal != null ? `${r.p.dorsal} · ` : ""}
                      {r.p.nombre} {r.p.apellidos}
                    </td>
                    <td className="text-center font-extrabold">{r.goles}</td>
                    <td className="text-center">{r.amarillas}</td>
                    <td className="text-center">{r.rojas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {matches.length === 0 && (
          <p className="text-center text-slate-500 py-8">
            Cuando finalices partidos, aquí verás los acumulados de la temporada.
          </p>
        )}
      </main>
    </>
  );
}

function StatTriple({
  tipo,
  favor,
  contra,
}: {
  tipo: EventType;
  favor: number;
  contra: number;
}) {
  return (
    <>
      <p className="text-center font-extrabold">{favor}</p>
      <p className="text-center text-slate-500 font-semibold px-3">
        {EVENT_ICONS[tipo]} {EVENT_LABELS[tipo]}
      </p>
      <p className="text-center font-extrabold">{contra}</p>
    </>
  );
}
