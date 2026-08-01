import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { MatchForm } from "@/components/MatchForm";
import { deleteMatch, saveMatch } from "@/app/actions/matches";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Match } from "@/lib/types";

export default async function EditarPartidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCoach();
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!match) notFound();

  return (
    <>
      <PageHeader title="Editar partido" backHref={`/partidos/${id}`} />
      <MatchForm match={match as Match} action={saveMatch} />
      <form action={deleteMatch} className="px-4 pb-8">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="w-full rounded-xl border border-red-300 text-red-600 py-3 font-bold text-sm"
        >
          Eliminar partido
        </button>
      </form>
    </>
  );
}
