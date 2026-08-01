import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PlayerForm } from "@/components/PlayerForm";
import { savePlayer } from "@/app/actions/players";
import { getSignedPhotoUrls } from "@/lib/photos";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Player } from "@/lib/types";

export default async function EditarJugadorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCoach();
  const supabase = await createClient();

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!player) notFound();

  const fotos = await getSignedPhotoUrls([player.foto_path]);

  return (
    <>
      <PageHeader title="Editar jugador" backHref={`/plantilla/${id}`} />
      <PlayerForm
        player={player as Player}
        fotoUrl={player.foto_path ? fotos[player.foto_path] : null}
        action={savePlayer}
      />
    </>
  );
}
