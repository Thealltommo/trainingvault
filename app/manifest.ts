import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "The Agoge",
    short_name: "Agoge",
    description: "The Agoge Athlete OS V4 — private planning, recovery, Garmin, activity intelligence and adaptive coaching.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07101e",
    theme_color: "#07101e",
    orientation: "portrait-primary",
    categories: ["fitness", "health", "sports"],
    shortcuts: [
      {
        name: "Today",
        short_name: "Today",
        description: "Open today's training decision.",
        url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Plan",
        short_name: "Plan",
        description: "Open the current training programme.",
        url: "/plan",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Coach",
        short_name: "Coach",
        description: "Ask The Agoge Coach about training or plan changes.",
        url: "/coach",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Training Log",
        short_name: "Log",
        description: "Review completed training and Garmin activities.",
        url: "/log",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
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
