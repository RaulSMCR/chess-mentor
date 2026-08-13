import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chess Mentor",
    short_name: "Chess Mentor",
    description: "Análisis local de partidas de ajedrez.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8fa",
    theme_color: "#17202a",
    lang: "es",
    categories: ["games", "education"],
    icons: [
      {
        src: "/chess-mentor-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
