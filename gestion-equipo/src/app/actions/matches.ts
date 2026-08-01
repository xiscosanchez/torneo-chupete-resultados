"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireCoach } from "@/lib/supabase/server";

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function saveMatch(formData: FormData) {
  await requireCoach();
  const supabase = await createClient();

  const id = str(formData, "id");
  const fields = {
    tipo: (str(formData, "tipo") ?? "liga") as "liga" | "amistoso" | "copa" | "torneo",
    rival: str(formData, "rival") ?? "",
    fecha: new Date(str(formData, "fecha") ?? "").toISOString(),
    lugar: str(formData, "lugar"),
    es_local: formData.get("es_local") === "on",
    notas: str(formData, "notas"),
  };

  let matchId = id;
  if (id) {
    const { error } = await supabase.from("matches").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase
      .from("matches")
      .insert(fields)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    matchId = data.id;
  }

  revalidatePath("/calendario");
  redirect(`/partidos/${matchId}`);
}

export async function deleteMatch(formData: FormData) {
  await requireCoach();
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;
  const { error } = await supabase.from("matches").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendario");
  redirect("/calendario");
}

export async function setMatchStatus(formData: FormData) {
  await requireCoach();
  const supabase = await createClient();
  const id = str(formData, "id");
  const estado = str(formData, "estado");
  if (!id || !estado) return;
  const { error } = await supabase.from("matches").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/partidos/${id}`);
  revalidatePath("/calendario");
}
