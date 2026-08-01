import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { CallupManager } from "@/components/CallupManager";
import { getSignedPhotoUrls } from "@/lib/photos";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Callup, CallupPlayer, Match, PlayerPublic } from "@/lib/types";

export default async function ConvocatoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCoach();
  const supabase = await createClient();

  const { data: matchData } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!matchData) notFound();
  const match = matchData as Match;

  const [{ data: playersData }, { data: callupData }] = await Promise.all([
    supabase.from("players_public").select("*").eq("activo", true).order("dorsal"),
    supabase.from("callups").select("*").eq("match_id", id).maybeSingle(),
  ]);

  const players = (playersData ?? []) as PlayerPublic[];
  const callup = callupData as Callup | null;

  let callupPlayers: CallupPlayer[] = [];
  if (callup) {
    const { data } = await supabase
      .from("callup_players")
      .select("*")
      .eq("callup_id", callup.id);
    callupPlayers = (data ?? []) as CallupPlayer[];
  }

  const fotos = await getSignedPhotoUrls(players.map((p) => p.foto_path));

  return (
    <>
      <PageHeader
        title={`Convocatoria · vs ${match.rival}`}
        backHref={`/partidos/${id}`}
      />
      <p className="px-4 pt-3 text-sm text-slate-500 font-semibold capitalize">
        {format(new Date(match.fecha), "EEEE d 'de' MMMM · HH:mm", { locale: es })}
      </p>
      <CallupManager
        matchId={id}
        players={players}
        fotos={fotos}
        callupPlayers={callupPlayers}
        published={Boolean(callup?.published_at)}
        deadline={callup?.deadline ?? null}
        notas={callup?.notas ?? null}
      />
    </>
  );
}
