import { test, expect } from "@playwright/test";

test.describe("Smoke E2E", () => {
  test("login page carga", async ({ page }) => {
    await page.goto("/login");
    // i18n: auth.login.title / auth.login.submit (no "Entrar")
    await expect(page.locator(".auth-title")).toContainText(/Inicia sesión/i);
    await expect(page.getByRole("button", { name: /Iniciar sesión/i })).toBeVisible();
  });

  test("register page carga", async ({ page }) => {
    await page.goto("/register");
    // i18n: auth.register.title — "Crea tu cuenta en Saletse" (no el literal corto "Crear cuenta")
    await expect(page.locator(".auth-title")).toContainText(/Crea tu cuenta/i);
  });

  test("ruta protegida redirige a login sin sesión", async ({ page }) => {
    await page.goto("/settings");
    // Requiere isSupabaseConfigured=true (stack local con VITE_SUPABASE_* o dummy en Playwright).
    // Sin eso, ProtectedRoute en DEV entra en modo local y no redirige.
    await expect(page).toHaveURL(/\/login/);
  });

  test("API health responde vía proxy", async ({ request }) => {
    const res = await request.get("/api/v1");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.version).toBe("v1");
  });

  test("geo countries es público", async ({ request }) => {
    const res = await request.get("/api/v1/geo/countries");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBeGreaterThan(0);
  });
});
