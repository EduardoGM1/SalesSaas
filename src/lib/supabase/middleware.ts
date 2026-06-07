import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

const PUBLIC_PREFIXES = ["/login", "/register", "/forgot-password", "/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Sin Supabase configurado, la app sigue funcionando en modo local.
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // La API REST gestiona su propia auth (401 JSON, no redirect).
  if (pathname.startsWith("/api/")) return response;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/register" || pathname === "/forgot-password")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (user && !isPublic(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_active === false) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "deactivated");
      return NextResponse.redirect(url);
    }
  }

  response.headers.set("x-pathname", pathname);
  return response;
}
