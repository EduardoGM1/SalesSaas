import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/layouts/DashboardLayout.jsx";
import { AuthLayout } from "@/layouts/AuthLayout.jsx";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute.jsx";
import { LoginPage } from "@/pages/LoginPage.jsx";
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
