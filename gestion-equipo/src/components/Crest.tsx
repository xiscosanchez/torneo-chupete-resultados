"use client";

import { useState } from "react";

/**
 * Escudo del club: usa /escudo.png si existe (colócalo en public/),
 * con balón ⚽ como reserva mientras tanto.
 */
export function Crest({ size = 96 }: { size?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="rounded-full bg-white/10 flex items-center justify-center"
        style={{ width: size, height: size, fontSize: size * 0.55 }}
      >
        ⚽
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/escudo.png"
      alt="Escudo del club"
      width={size}
      height={size}
      className="object-contain"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
