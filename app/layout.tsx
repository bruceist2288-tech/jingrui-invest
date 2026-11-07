import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "排雷選股",
  description: "先排雷，再選股。總裁個人版，不自動下單。",
  applicationName: "排雷選股",
  appleWebApp: { capable: true, title: "排雷選股", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#8f2d2d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
