import type { MetadataRoute } from "next";

// Installable as a home-screen app on branch tablets and phones.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wingboss FMS",
    short_name: "Wingboss",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
