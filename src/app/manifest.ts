import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chess Mentor",
    short_name: "Chess Mentor",
    description: "Estudio de ajedrez con Practica e Instructor.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F6EFDF",
    theme_color: "#2B7073",
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
