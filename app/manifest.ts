import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wrangle",
    short_name: "Wrangle",
    description:
      "What to do, what you're thinking about, what you're learning, what you're spending.",
    id: "/today",
    start_url: "/today",
    display: "standalone",
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
    share_target: {
      action: "/today",
      method: "GET",
      params: {
        title: "title",
        text: "text",
        url: "link",
      },
    },
  };
}
