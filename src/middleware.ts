import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Coincide con todas las rutas excepto:
     * - _next/static, _next/image
     * - archivos estáticos de la PWA e imágenes
     */
    "/((?!_next/static|_next/image|favicon.ico|favicon.png|manifest.webmanifest|sw.js|icon.svg|icon-maskable.svg|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
