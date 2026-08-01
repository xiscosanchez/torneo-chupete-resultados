import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { deletePlayer } from "@/app/actions/players";
import { getSignedPhotoUrls } from "@/lib/photos";
import { POSITION_COLORS, POSITION_LABELS } from "@/lib/labels";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type { Player } from "@/lib/types";

export default async function FichaJugadorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const isCoach = profile.role === "entrenador";

  // El entrenador (o el propio jugador) ve la ficha completa; el resto, la pública
  let player: Partial<Player> | null = null;
  const { data: full } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (full) {
    player = full as Player;
  } else {
    const { data: pub } = await supabase
      .from("players_public")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    player = pub as Partial<Player> | null;
  }
  if (!player) notFound();

  const fotos = await getSignedPhotoUrls([player.foto_path ?? null]);
  const fotoUrl = player.foto_path ? fotos[player.foto_path] : null;
  const fullView = Boolean(full);

  return (
    <>
      <PageHeader
        title="Ficha de jugador"
        backHref="/plantilla"
        action={
          isCoach ? (
            <Link
              href={`/plantilla/${id}/editar`}
              className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold"
            >
              <Pencil size={14} /> Editar
            </Link>
          ) : undefined
        }
      />

      <main className="px-4 py-6 space-y-5">
        <div className="flex flex-col items-center text-center">
          <PlayerAvatar
            url={fotoUrl}
            nombre={player.nombre ?? "?"}
            apellidos={player.apellidos}
            size={112}
          />
          <h2 className="mt-3 text-2xl font-extrabold">
            {player.nombre} {player.apellidos}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2.5 py-1 rounded-full ${POSITION_COLORS[player.demarcacion ?? "CEN"]}`}
            >
              {player.subposicion || POSITION_LABELS[player.demarcacion ?? "CEN"]}
            </span>
            {player.dorsal != null && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
                Dorsal {player.dorsal}
              </span>
            )}
            {player.activo === false && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                Inactivo
              </span>
            )}
          </div>
        </div>

        {fullView && (
          <div className="rounded-2xl bg-white shadow-sm divide-y divide-slate-100">
            <Row label="DNI" value={player.dni} />
            <Row
              label="Fecha de nacimiento"
              value={
                player.fecha_nacimiento
                  ? format(new Date(player.fecha_nacimiento), "d 'de' MMMM 'de' yyyy", {
                      locale: es,
                    })
                  : null
              }
            />
            <Row label="Teléfono" value={player.telefono} />
            <Row label="Email" value={player.email} />
            <Row label="Notas" value={player.notas} />
            <Row
              label="Cuenta en la app"
              value={player.profile_id ? "Vinculada ✅" : "Sin vincular (se vincula al iniciar sesión con su email)"}
            />
          </div>
        )}

        {isCoach && (
          <form
            action={deletePlayer}
            className="pt-2"
          >
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              className="w-full rounded-xl border border-red-300 text-red-600 py-3 font-bold text-sm"
            >
              Eliminar jugador
            </button>
          </form>
        )}
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-semibold text-slate-800">{value || "—"}</p>
    </div>
  );
}
