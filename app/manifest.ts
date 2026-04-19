import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Library - Self-Hosted Reading App",
    short_name: "Library",
    description: "A minimalist self-hosted reading platform for EPUB and PDF books.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eadcc8",
    theme_color: "#31583f",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
