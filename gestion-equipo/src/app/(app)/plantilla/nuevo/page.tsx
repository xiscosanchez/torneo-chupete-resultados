import { PageHeader } from "@/components/PageHeader";
import { PlayerForm } from "@/components/PlayerForm";
import { savePlayer } from "@/app/actions/players";
import { requireCoach } from "@/lib/supabase/server";

export default async function NuevoJugadorPage() {
  await requireCoach();
  return (
    <>
      <PageHeader title="Nuevo jugador" backHref="/plantilla" />
      <PlayerForm action={savePlayer} />
    </>
  );
}
