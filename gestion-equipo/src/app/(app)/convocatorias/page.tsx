import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { CallupResponse } from "@/components/CallupResponse";
import {
  CALLUP_STATUS_LABELS,
  MATCH_TYPE_COLORS,
  MATCH_TYPE_LABELS,
} from "@/lib/labels";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type { Callup, CallupPlayer, CallupStatus, Match } from "@/lib/types";

type CallupRow = CallupPlayer & {
  callups: Callup & { matches: Match };
};

export default async function ConvocatoriasPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (profile.role === "entrenador") {
    return <CoachView />;
  }

  // Ficha de jugador vinculada a este perfil
  const { data: player } = await supabase
    .from("players_public")
    .select("id, nombre")
    .eq("profile_id", profile.id)
    .maybeSingle();

  let rows: CallupRow[] = [];
  if (player) {
    const { data } = await supabase
      .from("callup_players")
      .select("*, callups!inner(*, matches!inner(*))")
      .eq("player_id", player.id)
      .not("callups.published_at", "is", null);
    rows = ((data ?? []) as CallupRow[]).sort(
      (a, b) =>
        new Date(a.callups.matches.fecha).getTime() -
        new Date(b.callups.matches.fecha).getTime()
    );
  }

  const now = Date.now();
  const upcoming = rows.filter((r) => new Date(r.callups.matches.fecha).getTime() >= now);
  const past = rows.filter((r) => new Date(r.callups.matches.fecha).getTime() < now).reverse();

  return (
    <>
      <PageHeader title="Mis convocatorias" />
      <main className="px-4 py-4 space-y-6">
        {!player && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 font-semibold">
            Tu cuenta todavía no está vinculada a ninguna ficha de jugador. Pide al
            entrenador que añada tu email ({profile.email}) a tu ficha.
          </div>
        )}

        {player && upcoming.length === 0 && (
          <p className="text-center text-slate-500 py-8">
            No tienes convocatorias pendientes. 💤
          </p>
        )}

        {upcoming.map((r) => {
          const m = r.callups.matches;
          return (
            <section key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${MATCH_TYPE_COLORS[m.tipo]}`}
                >
                  {MATCH_TYPE_LABELS[m.tipo]}
                </span>
                <StatusBadge estado={r.estado} />
              </div>
              <Link href={`/partidos/${m.id}`} className="block mt-2">
                <p className="font-extrabold text-lg">
                  {m.es_local ? `Nosotros — ${m.rival}` : `${m.rival} — Nosotros`}
                </p>
                <p className="text-sm text-slate-500 font-semibold capitalize">
                  {format(new Date(m.fecha), "EEEE d 'de' MMMM · HH:mm", { locale: es })}
                  {m.lugar ? ` · ${m.lugar}` : ""}
                </p>
              </Link>
              {r.callups.notas && (
                <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-xl p-2">
                  📝 {r.callups.notas}
                </p>
              )}
              {r.callups.deadline && r.estado === "pendiente" && (
                <p className="mt-1 text-xs text-amber-600 font-bold">
                  Responde antes del{" "}
                  {format(new Date(r.callups.deadline), "d MMM HH:mm", { locale: es })}
                </p>
              )}
              <CallupResponse callupPlayerId={r.id} estado={r.estado} />
            </section>
          );
        })}

        {past.length > 0 && (
          <section>
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-2">
              Anteriores
            </h2>
            <ul className="space-y-2">
              {past.map((r) => {
                const m = r.callups.matches;
                return (
                  <li
                    key={r.id}
                    className="rounded-2xl bg-white p-3 shadow-sm flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-sm">vs {m.rival}</p>
                      <p className="text-xs text-slate-400 font-semibold">
                        {format(new Date(m.fecha), "d MMM yyyy", { locale: es })}
                      </p>
                    </div>
                    <StatusBadge estado={r.estado} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

async function CoachView() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("callups")
    .select("*, matches!inner(*), callup_players(estado)")
    .not("published_at", "is", null);

  type Row = Callup & { matches: Match; callup_players: { estado: CallupStatus }[] };
  const rows = ((data ?? []) as Row[]).sort(
    (a, b) => new Date(a.matches.fecha).getTime() - new Date(b.matches.fecha).getTime()
  );

  return (
    <>
      <PageHeader title="Convocatorias" />
      <main className="px-4 py-4 space-y-3">
        {rows.length === 0 && (
          <p className="text-center text-slate-500 py-8">
            Ninguna convocatoria publicada. Crea una desde la página de un partido.
          </p>
        )}
        {rows.map((c) => {
          const total = c.callup_players.length;
          const ok = c.callup_players.filter((x) => x.estado === "aceptada").length;
          const no = c.callup_players.filter((x) => x.estado === "rechazada").length;
          const pdte = total - ok - no;
          return (
            <Link
              key={c.id}
              href={`/partidos/${c.match_id}/convocatoria`}
              className="block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-100"
            >
              <div className="flex items-center justify-between">
                <p className="font-extrabold">vs {c.matches.rival}</p>
                <p className="text-xs text-slate-400 font-semibold capitalize">
                  {format(new Date(c.matches.fecha), "EEE d MMM · HH:mm", { locale: es })}
                </p>
              </div>
              <p className="mt-1 text-sm font-bold">
                <span className="text-emerald-600">{ok} ✓</span>{" "}
                <span className="text-amber-500">{pdte} pdte.</span>{" "}
                <span className="text-red-500">{no} ✕</span>{" "}
                <span className="text-slate-400">de {total}</span>
              </p>
            </Link>
          );
        })}
      </main>
    </>
  );
}

function StatusBadge({ estado }: { estado: CallupStatus }) {
  return (
    <span
      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
        estado === "aceptada"
          ? "bg-emerald-100 text-emerald-700"
          : estado === "rechazada"
            ? "bg-red-100 text-red-700"
            : "bg-amber-100 text-amber-700"
      }`}
    >
      {CALLUP_STATUS_LABELS[estado]}
    </span>
  );
}
