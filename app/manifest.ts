import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wrangle",
    short_name: "Wrangle",
    description:
      "What to do, what you're thinking about, what you're learning, what you're spending.",
    id: "/today",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    launch_handler: { client_mode: "navigate-existing" },
    background_color: "#0b0e14",
    theme_color: "#0b0e14",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "New task",
        short_name: "New task",
        url: "/today?quick=1",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Today",
        short_name: "Today",
        url: "/today",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "New expense",
        short_name: "Expense",
        url: "/money?add=1",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
    // Text shares and audio files (V3 S7). Files need POST + multipart, which
    // public/sw.js answers on the device: it stashes the audio for the Dump
    // and redirects to /today with the text fields as before. app/share/route.ts
    // is the no-service-worker fallback.
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "link",
        files: [{ name: "audio", accept: ["audio/*"] }],
      },
    },
  };
}
