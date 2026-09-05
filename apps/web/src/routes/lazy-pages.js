import { namedLazy } from "@/lib/lazy-retry.js";

export const SettingsPage = namedLazy(() => import("@/components/settings/settings-page.tsx"), "SettingsPage");
export const ClientsPage = namedLazy(() => import("@/components/clients/clients-page.jsx"), "ClientsPage");
export const ClientDetailPage = namedLazy(() => import("@/components/clients/client-detail.jsx"), "ClientDetail");
export const OpcExpedientePage = namedLazy(() => import("@/components/clients/opc-expediente-page.jsx"), "OpcExpedientePage");
export const MessagesPage = namedLazy(() => import("@/pages/MessagesPage.jsx"), "MessagesPage");
export const NetworkPage = namedLazy(() => import("@/pages/NetworkPage.jsx"), "NetworkPage");
export const ContactPage = namedLazy(() => import("@/pages/ContactPage.jsx"), "ContactPage");
export const TeamPage = namedLazy(() => import("@/pages/TeamPage.jsx"), "TeamPage");
export const SalesHistoryPage = namedLazy(() => import("@/pages/SalesHistoryPage.jsx"), "SalesHistoryPage");
export const ToolsHubPage = namedLazy(() => import("@/pages/ToolsHubPage.jsx"), "ToolsHubPage");
export const GoalsPage = namedLazy(() => import("@/components/goals/goals-page.jsx"), "GoalsPage");
export const MetasPage = namedLazy(() => import("@/components/goals/metas-page.jsx"), "MetasPage");

export const SurveyPage = namedLazy(() => import("@/components/calculators/survey-page.jsx"), "SurveyPage");
export const VacacionesPage = namedLazy(() => import("@/components/calculators/vacaciones-page.jsx"), "VacacionesPage");
export const WorksheetPage = namedLazy(() => import("@/components/calculators/worksheet-page.jsx"), "WorksheetPage");
export const MoneyBoxPage = namedLazy(() => import("@/components/calculators/money-box-page.jsx"), "MoneyBoxPage");
export const AnalysisPage = namedLazy(() => import("@/components/calculators/analysis-page.jsx"), "AnalysisPage");

export const RhBottomLinesPage = namedLazy(() => import("@/pages/rh/RhBottomLinesPage.jsx"), "RhBottomLinesPage");
export const RhComisionesPage = namedLazy(() => import("@/pages/rh/RhComisionesPage.jsx"), "RhComisionesPage");
export const RhCreditosPage = namedLazy(() => import("@/pages/rh/RhCreditosPage.jsx"), "RhCreditosPage");
export const RhCalendarioComisionesPage = namedLazy(() => import("@/pages/rh/RhCalendarioComisionesPage.jsx"), "RhCalendarioComisionesPage");
export const RhDiasDescansoPage = namedLazy(() => import("@/pages/rh/RhDiasDescansoPage.jsx"), "RhDiasDescansoPage");
export const RhOpsHubPage = namedLazy(() => import("@/pages/rh/RhOpsHubPage.jsx"), "RhOpsHubPage");
export const RhPremanifiestoPage = namedLazy(() => import("@/pages/rh/RhPremanifiestoPage.jsx"), "RhPremanifiestoPage");
export const RhLineaPage = namedLazy(() => import("@/pages/rh/RhOpsModulesPage.jsx"), "RhLineaPage");
export const RhResumenOpsPage = namedLazy(() => import("@/pages/rh/RhOpsModulesPage.jsx"), "RhResumenOpsPage");
export const RhEstadisticosPage = namedLazy(() => import("@/pages/rh/RhOpsModulesPage.jsx"), "RhEstadisticosPage");
export const RhOkrPage = namedLazy(() => import("@/pages/rh/RhOpsModulesPage.jsx"), "RhOkrPage");
export const RhCalendarioDescansosPage = namedLazy(() => import("@/pages/rh/RhOpsModulesPage.jsx"), "RhCalendarioDescansosPage");
export const RhPropinasPage = namedLazy(() => import("@/pages/rh/RhOpsModulesPage.jsx"), "RhPropinasPage");

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
