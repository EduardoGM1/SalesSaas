import { namedLazy } from "@/lib/lazy-retry.js";

export const SettingsPage = namedLazy(() => import("@/components/settings/settings-page.tsx"), "SettingsPage");
export const ClientsPage = namedLazy(() => import("@/modulos/expediente/paginas.js"), "ClientsPage");
export const ClientDetailPage = namedLazy(() => import("@/modulos/expediente/paginas.js"), "ClientDetail");
export const ExpedienteLinkPage = namedLazy(() => import("@/modulos/expediente/paginas.js"), "ExpedienteLinkPage");
export const ExpedienteInvitePage = namedLazy(() => import("@/modulos/expediente/paginas.js"), "ExpedienteInvitePage");
export const OpcExpedientePage = namedLazy(() => import("@/modulos/royal-holiday/opc.js"), "OpcExpedientePage");
export const MessagesPage = namedLazy(() => import("@/pages/MessagesPage.jsx"), "MessagesPage");
export const NetworkPage = namedLazy(() => import("@/pages/NetworkPage.jsx"), "NetworkPage");
export const ContactPage = namedLazy(() => import("@/pages/ContactPage.jsx"), "ContactPage");
export const TeamPage = namedLazy(() => import("@/pages/TeamPage.jsx"), "TeamPage");
export const SalesHistoryPage = namedLazy(() => import("@/modulos/ventas"), "SalesHistoryPage");
export const ToolsHubPage = namedLazy(() => import("@/pages/ToolsHubPage.jsx"), "ToolsHubPage");
export const GoalsPage = namedLazy(() => import("@/components/goals/goals-page.jsx"), "GoalsPage");
export const MetasPage = namedLazy(() => import("@/components/goals/metas-page.jsx"), "MetasPage");

export const SurveyPage = namedLazy(() => import("@/modulos/survey"), "SurveyPage");
export const VacacionesPage = namedLazy(() => import("@/components/calculators/vacaciones-page.jsx"), "VacacionesPage");
export const WorksheetPage = namedLazy(() => import("@/components/calculators/worksheet-page.jsx"), "WorksheetPage");
export const MoneyBoxPage = namedLazy(() => import("@/modulos/money-box"), "MoneyBoxPage");
export const AnalysisPage = namedLazy(() => import("@/components/calculators/analysis-page.jsx"), "AnalysisPage");

export const RhBottomLinesPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhBottomLinesPage");
export const RhComisionesPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhComisionesPage");
export const RhCreditosPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhCreditosPage");
export const RhCalendarioComisionesPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhCalendarioComisionesPage");
export const RhDiasDescansoPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhDiasDescansoPage");
export const RhOpsHubPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhOpsHubPage");
export const RhPremanifiestoPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhPremanifiestoPage");
export const RhLineaPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhLineaPage");
export const RhResumenOpsPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhResumenOpsPage");
export const RhEstadisticosPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhEstadisticosPage");
export const RhOkrPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhOkrPage");
export const RhCalendarioDescansosPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhCalendarioDescansosPage");
export const RhPropinasPage = namedLazy(() => import("@/modulos/royal-holiday/paginas.js"), "RhPropinasPage");

export const AdminOverviewPage = namedLazy(() => import("@/pages/admin/AdminOverviewPage.jsx"), "AdminOverviewPage");
export const AdminUsersPage = namedLazy(() => import("@/pages/admin/AdminUsersPage.jsx"), "AdminUsersPage");
export const AdminGoalsPage = namedLazy(() => import("@/pages/admin/AdminGoalsPage.jsx"), "AdminGoalsPage");
export const AdminToolsUsagePage = namedLazy(() => import("@/pages/admin/AdminToolsUsagePage.jsx"), "AdminToolsUsagePage");
export const AdminSupportPage = namedLazy(() => import("@/pages/admin/AdminSupportPage.jsx"), "AdminSupportPage");
export const AdminRolesPage = namedLazy(() => import("@/pages/admin/AdminRolesPage.jsx"), "AdminRolesPage");
export const AdminModulesPage = namedLazy(() => import("@/pages/admin/AdminModulesPage.jsx"), "AdminModulesPage");
export const AdminEmpresasPage = namedLazy(() => import("@/pages/admin/AdminEmpresasPage.jsx"), "AdminEmpresasPage");
export const AdminLogsPage = namedLazy(() => import("@/pages/admin/AdminLogsPage.jsx"), "AdminLogsPage");
export const AdminLegacyRedirect = namedLazy(() => import("@/components/layout/admin-topbar-tabs.jsx"), "AdminLegacyRedirect");
