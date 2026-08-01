"use client";

import { useState } from "react";
import { Crest } from "@/components/Crest";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 bg-gradient-to-b from-stone-900 to-black">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center">
          <Crest size={110} />
          <h1 className="mt-3 text-2xl font-extrabold text-amber-400">
            Sporting Ciutat de Palma
          </h1>
          <p className="text-stone-300 mt-1 text-sm">
            Plantilla · Calendario · Convocatorias · Estadísticas
          </p>
        </div>

        {sent ? (
          <div className="bg-white rounded-2xl p-6 text-center shadow-xl">
            <div className="text-4xl mb-2">📬</div>
            <h2 className="font-bold text-lg">Revisa tu correo</h2>
            <p className="text-slate-600 mt-1 text-sm">
              Te hemos enviado un enlace de acceso a <strong>{email}</strong>.
              Ábrelo desde este dispositivo.
            </p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-sm text-green-700 font-semibold"
            >
              Usar otro correo
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl p-6 shadow-xl space-y-4"
          >
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">
                Tu correo electrónico
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jugador@correo.com"
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </label>
            {error && (
              <p className="text-sm text-red-600 font-medium">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-green-700 py-3 font-bold text-white active:bg-green-800 disabled:opacity-60"
            >
              {loading ? "Enviando…" : "Enviarme enlace de acceso"}
            </button>
            <p className="text-xs text-slate-500 text-center">
              Sin contraseñas: recibirás un enlace mágico por correo.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
