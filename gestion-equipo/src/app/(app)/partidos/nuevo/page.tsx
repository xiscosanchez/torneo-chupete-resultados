import { PageHeader } from "@/components/PageHeader";
import { MatchForm } from "@/components/MatchForm";
import { saveMatch } from "@/app/actions/matches";
import { requireCoach } from "@/lib/supabase/server";

export default async function NuevoPartidoPage() {
  await requireCoach();
  return (
    <>
      <PageHeader title="Nuevo partido" backHref="/calendario" />
      <MatchForm action={saveMatch} />
    </>
  );
}
