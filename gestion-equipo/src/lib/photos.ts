import "server-only";
import { createClient } from "@/lib/supabase/server";

/** URLs firmadas (1h) para un conjunto de foto_path. Devuelve mapa path → url. */
export async function getSignedPhotoUrls(
  paths: (string | null)[]
): Promise<Record<string, string>> {
  const valid = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (valid.length === 0) return {};

  const supabase = await createClient();
  const { data } = await supabase.storage.from("fotos").createSignedUrls(valid, 3600);

  const map: Record<string, string> = {};
  data?.forEach((item) => {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  });
  return map;
}
