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

export async function savePlayer(formData: FormData) {
  await requireCoach();
  const supabase = await createClient();

  const id = str(formData, "id");
  const dorsalRaw = str(formData, "dorsal");

  const fields = {
    nombre: str(formData, "nombre") ?? "",
    apellidos: str(formData, "apellidos") ?? "",
    dni: str(formData, "dni"),
    fecha_nacimiento: str(formData, "fecha_nacimiento"),
    demarcacion: (str(formData, "demarcacion") ?? "CEN") as
      | "POR"
      | "DEF"
      | "CEN"
      | "DEL",
    subposicion: str(formData, "subposicion"),
    dorsal: dorsalRaw ? parseInt(dorsalRaw, 10) : null,
    telefono: str(formData, "telefono"),
    email: str(formData, "email"),
    notas: str(formData, "notas"),
    activo: formData.get("activo") === "on",
  };

  let playerId = id;
  if (id) {
    const { error } = await supabase.from("players").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase
      .from("players")
      .insert(fields)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    playerId = data.id;
  }

  // Foto (opcional): el cliente ya la ha comprimido a JPEG
  const foto = formData.get("foto");
  if (foto instanceof File && foto.size > 0 && playerId) {
    const path = `players/${playerId}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("fotos")
      .upload(path, foto, { upsert: true, contentType: "image/jpeg" });
    if (upErr) throw new Error(`Error subiendo foto: ${upErr.message}`);
    await supabase.from("players").update({ foto_path: path }).eq("id", playerId);
  }

  revalidatePath("/plantilla");
  redirect(`/plantilla/${playerId}`);
}

export async function deletePlayer(formData: FormData) {
  await requireCoach();
  const supabase = await createClient();
  const id = str(formData, "id");
  if (!id) return;

  const { data: player } = await supabase
    .from("players")
    .select("foto_path")
    .eq("id", id)
    .single();
  if (player?.foto_path) {
    await supabase.storage.from("fotos").remove([player.foto_path]);
  }
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/plantilla");
  redirect("/plantilla");
}
