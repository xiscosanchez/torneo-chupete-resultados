import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { LiveMatch } from "@/components/LiveMatch";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type { Callup, Match, MatchEvent, PlayerPublic } from "@/lib/types";

export default async function DirectoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: matchData } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!matchData) notFound();

  const [{ data: eventsData }, { data: callupData }] = await Promise.all([
    supabase
      .from("match_events")
      .select("*")
      .eq("match_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("callups").select("*").eq("match_id", id).maybeSingle(),
  ]);

  // Jugadores asignables: convocados que aceptaron, o toda la plantilla activa
  const callup = callupData as Callup | null;
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
  }
  if (players.length === 0) {
    const { data } = await supabase
      .from("players_public")
      .select("*")
      .eq("activo", true)
      .order("dorsal");
    players = (data ?? []) as PlayerPublic[];
  }

  return (
    <>
      <PageHeader title="Partido en directo" backHref={`/partidos/${id}`} />
      <LiveMatch
        match={matchData as Match}
        events={(eventsData ?? []) as MatchEvent[]}
        players={players}
        isCoach={profile.role === "entrenador"}
      />
    </>
  );
}
