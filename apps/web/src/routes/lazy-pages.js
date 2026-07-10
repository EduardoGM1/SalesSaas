import { namedLazy } from "@/lib/lazy-retry.js";

export const SurveyPage = namedLazy(() => import("@/components/calculators/survey-page.jsx"), "SurveyPage");
export const VacacionesPage = namedLazy(() => import("@/components/calculators/vacaciones-page.jsx"), "VacacionesPage");
export const WorksheetPage = namedLazy(() => import("@/components/calculators/worksheet-page.jsx"), "WorksheetPage");
export const AnalysisPage = namedLazy(() => import("@/components/calculators/analysis-page.jsx"), "AnalysisPage");

export const AdminOverviewPage = namedLazy(() => import("@/pages/admin/AdminOverviewPage.jsx"), "AdminOverviewPage");
export const AdminUsersPage = namedLazy(() => import("@/pages/admin/AdminUsersPage.jsx"), "AdminUsersPage");
export const AdminSalesPage = namedLazy(() => import("@/pages/admin/AdminSalesPage.jsx"), "AdminSalesPage");
export const AdminAgendaPage = namedLazy(() => import("@/pages/admin/AdminAgendaPage.jsx"), "AdminAgendaPage");
export const AdminProspectsPage = namedLazy(() => import("@/pages/admin/AdminProspectsPage.jsx"), "AdminProspectsPage");
export const AdminGoalsPage = namedLazy(() => import("@/pages/admin/AdminGoalsPage.jsx"), "AdminGoalsPage");
export const AdminActivityPage = namedLazy(() => import("@/pages/admin/AdminActivityPage.jsx"), "AdminActivityPage");
export const AdminWorksheetsPage = namedLazy(() => import("@/pages/admin/AdminWorksheetsPage.jsx"), "AdminWorksheetsPage");
export const AdminWorksheetDetailPage = namedLazy(() => import("@/pages/admin/AdminWorksheetDetailPage.jsx"), "AdminWorksheetDetailPage");
