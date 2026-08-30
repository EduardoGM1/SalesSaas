import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildId = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.VERCEL_DEPLOYMENT_ID
  || `local-${Date.now()}`;

function writeBuildIdPlugin() {
  return {
    name: "write-build-id",
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "build-id.txt"), `${buildId}\n`);
    },
  };
}

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
  },
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
      injectRegister: false,
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
        // Nginx ya hace try_files → index.html. Un NavigationRoute de Workbox
        // puede rehidratar un shell cacheado (index-DS5s4Hkv.js / Cloud).
        navigateFallback: null,
        navigateFallbackDenylist: [/.*/],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // HTML siempre fresco: un index.html precacheado deja al usuario en chunks 404.
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        globIgnores: [
          "**/onesignal/**",
          "**/OneSignalSDKWorker.js",
          "**/OneSignalSDK.sw.js",
          "**/OneSignalSDK.page.js",
          "**/OneSignalSDK.page.es6.js",
          "index.html",
        ],
        runtimeCaching: [
          {
            // OneSignal SW (entry + runtime autohosteado) y CDN: NetworkOnly.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/onesignal/")
              || /OneSignalSDKWorker\.js$/i.test(url.pathname)
              || /OneSignalSDK\.sw\.js$/i.test(url.pathname)
              || /OneSignalSDK\.page(\.es6)?\.js$/i.test(url.pathname)
              || url.hostname === "cdn.onesignal.com",
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => url.pathname === "/build-id.txt",
            handler: "NetworkOnly",
          },
          {
            // sw.js cacheado deja al cliente en un precache viejo (p. ej. index-DS5s4Hkv.js de Cloud).
            urlPattern: ({ url }) =>
              url.pathname === "/sw.js"
              || /\/workbox-[^/]+\.js$/i.test(url.pathname),
            handler: "NetworkOnly",
          },
          {
            // Nunca caer al cache si el entry hash ya no existe en disco: un 404
            // con NetworkFirst rehidrata el bundle Cloud retirado.
            urlPattern: ({ url }) => /\/assets\/index-[^/]+\.js$/i.test(url.pathname),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) =>
              url.pathname === "/index.html" || url.pathname === "/",
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ request, url }) =>
              request.destination === "script"
              || request.destination === "style"
              || /\.(?:js|css)$/i.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-assets",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ request, url }) =>
              request.destination === "image"
              || /\.(?:png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "brand-images",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 14 },
            },
          },
          {
            // HTML siempre de red: NetworkFirst+3s servía index.html cacheado que
            // apuntaba a index-DS5s4Hkv.js (Cloud) aunque prod ya no lo tuviera.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/v1/auth/") || url.pathname.startsWith("/auth/"),
            handler: "NetworkOnly",
          },
          // Sync / prospects: nunca cachear (evita PWA↔Desktop con blob stale).
          {
            urlPattern: ({ url }) =>
              url.pathname === "/api/v1/sync"
              || url.pathname.startsWith("/api/v1/sync/")
              || url.pathname === "/api/v1/prospects"
              || /^\/api\/v1\/prospects(\/|$)/.test(url.pathname),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 },
            },
          },
        ],
      },
    }),
    writeBuildIdPlugin(),
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
        bypass(req) {
          const path = req.url?.split("?")[0] ?? "";
          if (path === "/auth/callback") return false;
        },
      },
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts")) return "recharts";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/@sentry")) return "sentry";
          if (id.includes("node_modules/@dnd-kit")) return "dnd-kit";
        },
      },
    },
  },
});
