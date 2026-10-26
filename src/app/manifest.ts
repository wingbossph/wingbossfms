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
    icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
