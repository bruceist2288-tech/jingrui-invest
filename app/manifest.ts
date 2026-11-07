import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "璟睿投資理財",
    short_name: "璟睿投資理財",
    description: "璟睿投資理財。先排雷，再選股。",
    start_url: "/jingrui-invest/",
    display: "standalone",
    background_color: "#f3ecdf",
    theme_color: "#8f2d2d",
    lang: "zh-TW",
    icons: [
      { src: "/jingrui-invest/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/jingrui-invest/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
