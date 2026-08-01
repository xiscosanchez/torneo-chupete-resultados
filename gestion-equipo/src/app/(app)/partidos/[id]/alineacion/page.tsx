import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { LineupBoard } from "@/components/LineupBoard";
import { getSignedPhotoUrls } from "@/lib/photos";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type { Callup, Lineup, LineupPlayer, Match, PlayerPublic } from "@/lib/types";

export default async function AlineacionPage({
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

  const [{ data: callupData }, { data: lineupData }] = await Promise.all([
    supabase.from("callups").select("*").eq("match_id", id).maybeSingle(),
    supabase.from("lineups").select("*").eq("match_id", id).maybeSingle(),
  ]);
  const callup = callupData as Callup | null;
  const lineup = lineupData as Lineup | null;

  // Jugadores disponibles: los que ACEPTARON la convocatoria; si no hay convocatoria, toda la plantilla activa
  let players: PlayerPublic[] = [];
  if (callup) {
    const { data: accepted } = await supabase
      .from("callup_players")
      .select("player_id")
      .eq("callup_id", callup.id)
      .eq("estado", "aceptada");
    const ids = (accepted ?? []).map((a) => a.player_id);
    if (ids.length > 0) {
      const { data } = await supabase
        .from("players_public")
        .select("*")
        .in("id", ids)
        .order("dorsal");
      players = (data ?? []) as PlayerPublic[];
    }
  } else {
    const { data } = await supabase
      .from("players_public")
      .select("*")
      .eq("activo", true)
      .order("dorsal");
    players = (data ?? []) as PlayerPublic[];
  }

  let lineupPlayers: LineupPlayer[] = [];
  if (lineup) {
    const { data } = await supabase
      .from("lineup_players")
      .select("*")
      .eq("lineup_id", lineup.id);
    lineupPlayers = (data ?? []) as LineupPlayer[];
  }

  const fotos = await getSignedPhotoUrls(players.map((p) => p.foto_path));

  return (
    <>
      <PageHeader title={`Alineación · vs ${match.rival}`} backHref={`/partidos/${id}`} />
      {isCoach && callup && players.length === 0 && (
        <p className="px-4 pt-3 text-sm text-amber-600 font-semibold">
          Nadie ha aceptado la convocatoria todavía: solo se puede alinear a jugadores
          que hayan aceptado.
        </p>
      )}
      {!isCoach && !lineup?.published_at ? (
        <p className="px-4 py-12 text-center text-slate-500">
          El entrenador todavía no ha publicado la alineación.
        </p>
      ) : (
        <LineupBoard
          matchId={id}
          players={players}
          fotos={fotos}
          initialFormacion={lineup?.formacion ?? "4-3-3"}
          initialLineupPlayers={lineupPlayers}
          editable={isCoach}
        />
      )}
    </>
  );
}
