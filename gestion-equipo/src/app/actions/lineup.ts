"use server";

import { revalidatePath } from "next/cache";
import { sendPushToProfiles } from "@/lib/push";
import { createClient, requireCoach } from "@/lib/supabase/server";

export interface LineupPlayerInput {
  player_id: string;
  titular: boolean;
  pos_x: number | null;
  pos_y: number | null;
}

export async function saveLineup(input: {
  matchId: string;
  formacion: string;
  players: LineupPlayerInput[];
  notify: boolean;
}) {
  await requireCoach();
  const supabase = await createClient();

  const { data: lineup, error: lErr } = await supabase
    .from("lineups")
    .upsert(
      {
        match_id: input.matchId,
        formacion: input.formacion,
        published_at: new Date().toISOString(),
      },
      { onConflict: "match_id" }
    )
    .select("id")
    .single();
  if (lErr) throw new Error(lErr.message);

  // Reemplazo completo de la alineación
  await supabase.from("lineup_players").delete().eq("lineup_id", lineup.id);
  if (input.players.length > 0) {
    const { error } = await supabase.from("lineup_players").insert(
      input.players.map((p) => ({
        lineup_id: lineup.id,
        player_id: p.player_id,
        titular: p.titular,
        pos_x: p.pos_x,
        pos_y: p.pos_y,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (input.notify && input.players.length > 0) {
    const { data: match } = await supabase
      .from("matches")
      .select("rival")
      .eq("id", input.matchId)
      .single();
    const { data: linked } = await supabase
      .from("players_public")
      .select("profile_id")
      .in(
        "id",
        input.players.map((p) => p.player_id)
      )
      .not("profile_id", "is", null);
    await sendPushToProfiles(
      (linked ?? []).map((l) => l.profile_id as string),
      {
        title: "📋 Alineación publicada",
        body: `Ya puedes ver la alineación del partido vs ${match?.rival ?? ""}.`,
        url: `/partidos/${input.matchId}/alineacion`,
      }
    );
  }

  revalidatePath(`/partidos/${input.matchId}`);
  revalidatePath(`/partidos/${input.matchId}/alineacion`);
}
