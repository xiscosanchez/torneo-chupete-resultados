import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sporting Ciutat de Palma — Gestión del equipo",
    short_name: "Sporting CP",
    description:
      "Plantilla, calendario, convocatorias con notificaciones y estadísticas en vivo",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1c1917",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
