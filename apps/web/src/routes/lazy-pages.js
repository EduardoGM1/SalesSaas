import { lazy } from "react";

const named = (loader, exportName) => lazy(() => loader().then((m) => ({ default: m[exportName] })));

export const SurveyPage = named(() => import("@/components/calculators/survey-page.jsx"), "SurveyPage");
export const VacacionesPage = named(() => import("@/components/calculators/vacaciones-page.jsx"), "VacacionesPage");
export const WorksheetPage = named(() => import("@/components/calculators/worksheet-page.jsx"), "WorksheetPage");
export const AnalysisPage = named(() => import("@/components/calculators/analysis-page.jsx"), "AnalysisPage");

export const AdminOverviewPage = named(() => import("@/pages/admin/AdminOverviewPage.jsx"), "AdminOverviewPage");
export const AdminUsersPage = named(() => import("@/pages/admin/AdminUsersPage.jsx"), "AdminUsersPage");
export const AdminSalesPage = named(() => import("@/pages/admin/AdminSalesPage.jsx"), "AdminSalesPage");
export const AdminAgendaPage = named(() => import("@/pages/admin/AdminAgendaPage.jsx"), "AdminAgendaPage");
export const AdminProspectsPage = named(() => import("@/pages/admin/AdminProspectsPage.jsx"), "AdminProspectsPage");
export const AdminGoalsPage = named(() => import("@/pages/admin/AdminGoalsPage.jsx"), "AdminGoalsPage");
export const AdminActivityPage = named(() => import("@/pages/admin/AdminActivityPage.jsx"), "AdminActivityPage");
export const AdminWorksheetsPage = named(() => import("@/pages/admin/AdminWorksheetsPage.jsx"), "AdminWorksheetsPage");
export const AdminWorksheetDetailPage = named(() => import("@/pages/admin/AdminWorksheetDetailPage.jsx"), "AdminWorksheetDetailPage");
