"use server";

import { revalidatePath } from "next/cache";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { EventTeam, EventType, MatchEvent } from "@/lib/types";

export async function addEvent(input: {
  matchId: string;
  minuto: number;
  equipo: EventTeam;
  tipo: EventType;
  playerId?: string | null;
}): Promise<MatchEvent> {
  await requireCoach();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("match_events")
    .insert({
      match_id: input.matchId,
      minuto: input.minuto,
      equipo: input.equipo,
      tipo: input.tipo,
      player_id: input.playerId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (input.tipo === "gol") {
    await bumpScore(input.matchId, input.equipo, 1);
  }

  revalidatePath(`/partidos/${input.matchId}`);
  return data as MatchEvent;
}

export async function undoEvent(eventId: string) {
  await requireCoach();
  const supabase = await createClient();

  const { data: ev } = await supabase
    .from("match_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return;

  await supabase.from("match_events").delete().eq("id", eventId);
  if (ev.tipo === "gol") {
    await bumpScore(ev.match_id, ev.equipo, -1);
  }
  revalidatePath(`/partidos/${ev.match_id}`);
}

async function bumpScore(matchId: string, equipo: EventTeam, delta: number) {
  const supabase = await createClient();
  const { data: match } = await supabase
    .from("matches")
    .select("goles_favor, goles_contra")
    .eq("id", matchId)
    .single();
  if (!match) return;

  const field = equipo === "favor" ? "goles_favor" : "goles_contra";
  const value = Math.max(0, (match[field] as number) + delta);
  await supabase.from("matches").update({ [field]: value }).eq("id", matchId);
}
