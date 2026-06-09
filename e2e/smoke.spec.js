import { test, expect } from "@playwright/test";

test.describe("Smoke E2E", () => {
  test("login page carga", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Iniciar sesión")).toBeVisible();
    await expect(page.getByRole("button", { name: /Entrar/i })).toBeVisible();
  });

  test("register page carga", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator(".auth-title", { hasText: "Crear cuenta" })).toBeVisible();
  });

  test("ruta protegida redirige a login sin sesión", async ({ page }) => {
    await page.goto("/settings");
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
