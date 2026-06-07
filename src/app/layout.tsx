import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const APP_NAME = "Sales Timeshare";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Herramienta de ventas timeshare: agenda, expedientes, calculadoras y metas.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.png"],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f2044",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen font-sans antialiased" style={{ background: "#f0f4f8", color: "#1a2540" }}>{children}</body>
    </html>
  );
}
