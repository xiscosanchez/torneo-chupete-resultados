"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { sendPushToProfiles } from "@/lib/push";
import { createClient, requireCoach, requireProfile } from "@/lib/supabase/server";

/**
 * Crea o actualiza la convocatoria de un partido y la publica:
 * añade/quita jugadores y envía push a los recién convocados.
 */
export async function publishCallup(input: {
  matchId: string;
  playerIds: string[];
  deadline: string | null;
  notas: string | null;
}) {
  await requireCoach();
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, rival, fecha, es_local")
    .eq("id", input.matchId)
    .single();
  if (!match) throw new Error("Partido no encontrado");

  // Upsert de la convocatoria
  const { data: callup, error: cErr } = await supabase
    .from("callups")
    .upsert(
      {
        match_id: input.matchId,
        deadline: input.deadline,
        notas: input.notas,
        published_at: new Date().toISOString(),
      },
      { onConflict: "match_id" }
    )
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);

  // Estado actual para saber quién es nuevo
  const { data: existing } = await supabase
    .from("callup_players")
    .select("id, player_id")
    .eq("callup_id", callup.id);
  const existingIds = new Set((existing ?? []).map((e) => e.player_id));

  const toAdd = input.playerIds.filter((p) => !existingIds.has(p));
  const toRemove = (existing ?? []).filter(
    (e) => !input.playerIds.includes(e.player_id)
  );

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("callup_players")
      .insert(toAdd.map((player_id) => ({ callup_id: callup.id, player_id })));
    if (error) throw new Error(error.message);
  }
  if (toRemove.length > 0) {
    await supabase
      .from("callup_players")
      .delete()
      .in(
        "id",
        toRemove.map((e) => e.id)
      );
  }

  // Push a los nuevos convocados que tengan cuenta vinculada
  if (toAdd.length > 0) {
    const { data: linked } = await supabase
      .from("players_public")
      .select("id, profile_id")
      .in("id", toAdd)
      .not("profile_id", "is", null);
    const profileIds = (linked ?? []).map((l) => l.profile_id as string);

    const cuando = format(new Date(match.fecha), "EEEE d 'a las' HH:mm", { locale: es });
    await sendPushToProfiles(profileIds, {
      title: "⚽ ¡Estás convocado!",
      body: `${match.es_local ? "vs" : "en casa de"} ${match.rival} · ${cuando}. Confirma tu asistencia.`,
      url: "/convocatorias",
    });
  }

  revalidatePath(`/partidos/${input.matchId}`);
  revalidatePath(`/partidos/${input.matchId}/convocatoria`);
  revalidatePath("/convocatorias");
  return { added: toAdd.length, removed: toRemove.length };
}

/** Recordatorio push a los convocados que siguen pendientes. */
export async function remindPending(matchId: string) {
  await requireCoach();
  const supabase = await createClient();

  const { data: callup } = await supabase
    .from("callups")
    .select("id, matches!inner(rival, fecha)")
    .eq("match_id", matchId)
    .single();
  if (!callup) return { sent: 0 };

  const { data: pend } = await supabase
    .from("callup_players")
    .select("player_id")
    .eq("callup_id", callup.id)
    .eq("estado", "pendiente");
  if (!pend || pend.length === 0) return { sent: 0 };

  const { data: linked } = await supabase
    .from("players_public")
    .select("profile_id")
    .in(
      "id",
      pend.map((p) => p.player_id)
    )
    .not("profile_id", "is", null);

  const match = callup.matches as unknown as { rival: string; fecha: string };
  const cuando = format(new Date(match.fecha), "EEEE d 'a las' HH:mm", { locale: es });
  const res = await sendPushToProfiles(
    (linked ?? []).map((l) => l.profile_id as string),
    {
      title: "⏰ Recuerda confirmar la convocatoria",
      body: `Partido vs ${match.rival} · ${cuando}. Acepta o rechaza en la app.`,
      url: "/convocatorias",
    }
  );
  return res;
}

/** El jugador responde a su convocatoria. */
export async function respondCallup(
  callupPlayerId: string,
  estado: "aceptada" | "rechazada",
  motivo?: string
) {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase
    .from("callup_players")
    .update({
      estado,
      motivo: estado === "rechazada" ? (motivo ?? null) : null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", callupPlayerId);
  if (error) throw new Error(error.message);

  revalidatePath("/convocatorias");
}
