import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "璟睿投資理財",
    short_name: "璟睿投資理財",
    description: "璟睿投資理財。先排雷，再選股。",
    start_url: "/",
    display: "standalone",
    background_color: "#f3ecdf",
    theme_color: "#8f2d2d",
    lang: "zh-TW",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
