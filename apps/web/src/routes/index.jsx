import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/layouts/DashboardLayout.jsx";
import { AuthLayout } from "@/layouts/AuthLayout.jsx";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute.jsx";
import { LoginPage } from "@/pages/LoginPage.jsx";
import { RegisterPage } from "@/pages/RegisterPage.jsx";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage.jsx";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage.jsx";
import { CalendarPage } from "@/components/calendar/calendar-page.jsx";
import { GoalsPage } from "@/components/goals/goals-page.jsx";
import { MetasPage } from "@/components/goals/metas-page.jsx";
import { ClientsPage } from "@/components/clients/clients-page.jsx";
import { ClientDetail } from "@/components/clients/client-detail.jsx";
import { SurveyPage } from "@/components/calculators/survey-page.jsx";
import { VacacionesPage } from "@/components/calculators/vacaciones-page.jsx";
import { WorksheetPage } from "@/components/calculators/worksheet-page.jsx";
import { AnalysisPage } from "@/components/calculators/analysis-page.jsx";
import { SettingsPage } from "@/components/settings/settings-page.jsx";
import { ToolsHubPage } from "@/pages/ToolsHubPage.jsx";
import { AdminSection } from "@/layouts/AdminSection.jsx";
import { AdminOverviewPage } from "@/pages/admin/AdminOverviewPage.jsx";
import { AdminUsersPage } from "@/pages/admin/AdminUsersPage.jsx";
import { AdminSalesPage } from "@/pages/admin/AdminSalesPage.jsx";
import { AdminAgendaPage } from "@/pages/admin/AdminAgendaPage.jsx";
import { AdminGoalsPage } from "@/pages/admin/AdminGoalsPage.jsx";
import { AdminActivityPage } from "@/pages/admin/AdminActivityPage.jsx";
import { AdminWorksheetsPage } from "@/pages/admin/AdminWorksheetsPage.jsx";
import { AdminWorksheetDetailPage } from "@/pages/admin/AdminWorksheetDetailPage.jsx";

function ClientDetailRoute() {
  const { id } = useParams();
  return <ClientDetail id={id} />;
}

function ClientToolRoute({ tool }) {
  const { id } = useParams();
  if (tool === "survey") return <SurveyPage clientId={id} />;
  if (tool === "vacaciones") return <VacacionesPage clientId={id} />;
  if (tool === "worksheet") return <WorksheetPage clientId={id} />;
  if (tool === "analysis") return <AnalysisPage clientId={id} />;
  return null;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<CalendarPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="metas" element={<MetasPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:id" element={<ClientDetailRoute />} />
        <Route path="clients/:id/survey" element={<ClientToolRoute tool="survey" />} />
        <Route path="clients/:id/vacaciones" element={<ClientToolRoute tool="vacaciones" />} />
        <Route path="clients/:id/worksheet" element={<ClientToolRoute tool="worksheet" />} />
        <Route path="clients/:id/analysis" element={<ClientToolRoute tool="analysis" />} />
        <Route path="tools" element={<ToolsHubPage />} />
        <Route path="tools/survey" element={<SurveyPage />} />
        <Route path="tools/vacaciones" element={<VacacionesPage />} />
        <Route path="tools/worksheet" element={<WorksheetPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminSection />}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="sales" element={<AdminSalesPage />} />
          <Route path="agenda" element={<AdminAgendaPage />} />
          <Route path="goals" element={<AdminGoalsPage />} />
          <Route path="activity" element={<AdminActivityPage />} />
          <Route path="worksheets" element={<AdminWorksheetsPage />} />
          <Route path="worksheets/:id" element={<AdminWorksheetDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
