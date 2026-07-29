import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrainVault",
    short_name: "TrainVault",
    description: "Private athlete operating system for planning, recovery, Garmin and adaptive coaching.",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#d7ff1f",
    orientation: "portrait-primary",
    categories: ["fitness", "health", "sports"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
