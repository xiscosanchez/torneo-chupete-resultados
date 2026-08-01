import { PageHeader } from "@/components/PageHeader";
import { PushToggle } from "@/components/PushToggle";
import { createClient, requireProfile } from "@/lib/supabase/server";

export default async function PerfilPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: player } = await supabase
    .from("players_public")
    .select("nombre, apellidos, dorsal")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Perfil" />
      <main className="px-4 py-5 space-y-5">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Sesión
          </p>
          <p className="font-extrabold text-lg">
            {player ? `${player.nombre} ${player.apellidos}` : profile.full_name}
          </p>
          <p className="text-sm text-slate-500 font-semibold">{profile.email}</p>
          <span className="mt-2 inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-800">
            {profile.role === "entrenador" ? "🎽 Entrenador" : "⚽ Jugador"}
            {player?.dorsal != null ? ` · Dorsal ${player.dorsal}` : ""}
          </span>
        </section>

        <section className="space-y-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            Notificaciones
          </h2>
          <PushToggle />
          <p className="text-xs text-slate-400">
            Recibirás un aviso cuando el entrenador te convoque a un partido o te envíe
            un recordatorio.
          </p>
        </section>

        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="w-full rounded-xl border border-red-300 text-red-600 py-3 font-bold text-sm"
          >
            Cerrar sesión
          </button>
        </form>
      </main>
    </>
  );
}
