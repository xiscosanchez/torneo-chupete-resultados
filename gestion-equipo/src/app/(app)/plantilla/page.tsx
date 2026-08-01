import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getSignedPhotoUrls } from "@/lib/photos";
import { POSITION_COLORS, POSITION_LABELS } from "@/lib/labels";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type { PlayerPublic, PositionGroup } from "@/lib/types";

const ORDER: PositionGroup[] = ["POR", "DEF", "CEN", "DEL"];

export default async function PlantillaPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const isCoach = profile.role === "entrenador";

  const source = isCoach ? "players" : "players_public";
  const { data } = await supabase
    .from(source)
    .select("id, nombre, apellidos, demarcacion, subposicion, dorsal, foto_path, activo")
    .order("dorsal", { ascending: true, nullsFirst: false });

  const players = (data ?? []) as PlayerPublic[];
  const fotos = await getSignedPhotoUrls(players.map((p) => p.foto_path));

  const byGroup = ORDER.map((g) => ({
    group: g,
    items: players.filter((p) => p.demarcacion === g && p.activo),
  }));
  const inactive = players.filter((p) => !p.activo);

  return (
    <>
      <PageHeader
        title="Plantilla"
        action={
          isCoach ? (
            <Link
              href="/plantilla/nuevo"
              className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold"
            >
              <Plus size={16} /> Nuevo
            </Link>
          ) : undefined
        }
      />

      <main className="px-4 py-4 space-y-6">
        {players.length === 0 && (
          <p className="text-center text-slate-500 py-12">
            Todavía no hay jugadores en la plantilla.
          </p>
        )}

        {byGroup.map(
          ({ group, items }) =>
            items.length > 0 && (
              <section key={group}>
                <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-2">
                  {POSITION_LABELS[group]}s
                </h2>
                <ul className="space-y-2">
                  {items.map((p) => (
                    <PlayerRow key={p.id} p={p} foto={p.foto_path ? fotos[p.foto_path] : null} />
                  ))}
                </ul>
              </section>
            )
        )}

        {inactive.length > 0 && (
          <section>
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-400 mb-2">
              Inactivos
            </h2>
            <ul className="space-y-2 opacity-60">
              {inactive.map((p) => (
                <PlayerRow key={p.id} p={p} foto={p.foto_path ? fotos[p.foto_path] : null} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

function PlayerRow({ p, foto }: { p: PlayerPublic; foto: string | null }) {
  return (
    <li>
      <Link
        href={`/plantilla/${p.id}`}
        className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm active:bg-slate-100"
      >
        <PlayerAvatar url={foto} nombre={p.nombre} apellidos={p.apellidos} />
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">
            {p.nombre} {p.apellidos}
          </p>
          <span
            className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${POSITION_COLORS[p.demarcacion]}`}
          >
            {p.subposicion || POSITION_LABELS[p.demarcacion]}
          </span>
        </div>
        {p.dorsal != null && (
          <span className="text-2xl font-extrabold text-slate-300">{p.dorsal}</span>
        )}
      </Link>
    </li>
  );
}
