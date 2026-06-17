import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [
    react({
      babel: {
        parserOpts: {
          plugins: ["typescript", "jsx"],
        },
      },
      jsxRuntime: "automatic",
    }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-maskable.svg", "favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Sales Timeshare",
        short_name: "Sales TS",
        description: "Herramienta de ventas timeshare: agenda, expedientes, calculadoras y metas.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#f0f4f8",
        theme_color: "#0f2044",
        lang: "es",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: {
        importScripts: ["/push-sw.js"],
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", networkTimeoutSeconds: 10 },
          },
        ],
      },
    }),
  ],
  publicDir: path.resolve(__dirname, "../../public"),
  esbuild: {
    loader: "tsx",
    include: /\.[jt]sx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        ".js": "jsx",
        ".jsx": "tsx",
        ".ts": "tsx",
        ".tsx": "tsx",
      },
    },
  },
  resolve: {
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
    alias: [
      { find: "@/lib/sync-api.js", replacement: path.resolve(__dirname, "src/lib/sync-api.js") },
      { find: "@/stores", replacement: path.resolve(__dirname, "src/stores") },
      { find: "@/lib", replacement: path.resolve(__dirname, "src/lib") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:4000",
        changeOrigin: true,
      },
      "/auth": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
