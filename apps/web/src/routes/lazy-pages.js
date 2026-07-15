import { namedLazy } from "@/lib/lazy-retry.js";

export const SurveyPage = namedLazy(() => import("@/components/calculators/survey-page.jsx"), "SurveyPage");
export const VacacionesPage = namedLazy(() => import("@/components/calculators/vacaciones-page.jsx"), "VacacionesPage");
export const WorksheetPage = namedLazy(() => import("@/components/calculators/worksheet-page.jsx"), "WorksheetPage");
export const AnalysisPage = namedLazy(() => import("@/components/calculators/analysis-page.jsx"), "AnalysisPage");

export const AdminOverviewPage = namedLazy(() => import("@/pages/admin/AdminOverviewPage.jsx"), "AdminOverviewPage");
export const AdminUsersPage = namedLazy(() => import("@/pages/admin/AdminUsersPage.jsx"), "AdminUsersPage");
export const AdminGoalsPage = namedLazy(() => import("@/pages/admin/AdminGoalsPage.jsx"), "AdminGoalsPage");
export const AdminToolsUsagePage = namedLazy(() => import("@/pages/admin/AdminToolsUsagePage.jsx"), "AdminToolsUsagePage");
export const AdminSupportPage = namedLazy(() => import("@/pages/admin/AdminSupportPage.jsx"), "AdminSupportPage");
export const AdminLegacyRedirect = namedLazy(() => import("@/components/layout/admin-topbar-tabs.jsx"), "AdminLegacyRedirect");
