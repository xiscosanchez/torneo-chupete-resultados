import Link from "next/link";
import { format, isPast } from "date-fns";
import { es } from "date-fns/locale";
import { MapPin, Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  MATCH_STATUS_LABELS,
  MATCH_TYPE_COLORS,
  MATCH_TYPE_LABELS,
} from "@/lib/labels";
import { createClient, requireProfile } from "@/lib/supabase/server";
import type { Match } from "@/lib/types";

export default async function CalendarioPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const isCoach = profile.role === "entrenador";

  const { data } = await supabase
    .from("matches")
    .select("*")
    .order("fecha", { ascending: true });

  const matches = (data ?? []) as Match[];
  const upcoming = matches.filter(
    (m) => !isPast(new Date(m.fecha)) || m.estado === "en_juego"
  );
  const past = matches
    .filter((m) => isPast(new Date(m.fecha)) && m.estado !== "en_juego")
    .reverse();

  return (
    <>
      <PageHeader
        title="Calendario"
        action={
          isCoach ? (
            <Link
              href="/partidos/nuevo"
              className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold"
            >
              <Plus size={16} /> Partido
            </Link>
          ) : undefined
        }
      />

      <main className="px-4 py-4 space-y-6">
        {matches.length === 0 && (
          <p className="text-center text-slate-500 py-12">
            No hay partidos en el calendario.
          </p>
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-2">
              Próximos partidos
            </h2>
            <ul className="space-y-2">
              {upcoming.map((m) => (
                <MatchCard key={m.id} m={m} />
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-2">
              Ya jugados
            </h2>
            <ul className="space-y-2">
              {past.map((m) => (
                <MatchCard key={m.id} m={m} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

function MatchCard({ m }: { m: Match }) {
  const fecha = new Date(m.fecha);
  const finished = m.estado === "finalizado";
  const live = m.estado === "en_juego";

  return (
    <li>
      <Link
        href={`/partidos/${m.id}`}
        className="block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-100"
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${MATCH_TYPE_COLORS[m.tipo]}`}
          >
            {MATCH_TYPE_LABELS[m.tipo]}
          </span>
          {live ? (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
              ● EN JUEGO
            </span>
          ) : (
            <span className="text-xs text-slate-400 font-semibold">
              {MATCH_STATUS_LABELS[m.estado]}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="font-extrabold text-lg leading-tight">
            {m.es_local ? `Nosotros — ${m.rival}` : `${m.rival} — Nosotros`}
          </p>
          {(finished || live) && (
            <p className="text-2xl font-extrabold whitespace-nowrap">
              {m.es_local
                ? `${m.goles_favor}-${m.goles_contra}`
                : `${m.goles_contra}-${m.goles_favor}`}
            </p>
          )}
        </div>

        <p className="mt-1 text-sm text-slate-500 font-semibold capitalize">
          {format(fecha, "EEEE d MMM · HH:mm", { locale: es })}
          {m.lugar && (
            <span className="normal-case">
              {" "}
              · <MapPin size={12} className="inline -mt-0.5" /> {m.lugar}
            </span>
          )}
        </p>
      </Link>
    </li>
  );
}
