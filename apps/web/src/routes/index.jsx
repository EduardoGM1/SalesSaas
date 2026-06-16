import { Suspense } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/layouts/DashboardLayout.jsx";
import { AuthLayout } from "@/layouts/AuthLayout.jsx";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute.jsx";
import { RouteFallback } from "@/components/layout/route-fallback.jsx";
import { LoginPage } from "@/pages/LoginPage.jsx";
import { RegisterPage } from "@/pages/RegisterPage.jsx";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage.jsx";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage.jsx";
import { CalendarPage } from "@/components/calendar/calendar-page.jsx";
import { GoalsPage } from "@/components/goals/goals-page.jsx";
import { MetasPage } from "@/components/goals/metas-page.jsx";
import { ClientsPage } from "@/components/clients/clients-page.jsx";
import { ClientDetail } from "@/components/clients/client-detail.jsx";
import { SettingsPage } from "@/components/settings/settings-page.jsx";
import { SalesHistoryPage } from "@/pages/SalesHistoryPage.jsx";
import { NetworkPage } from "@/pages/NetworkPage.jsx";
import { ContactPage } from "@/pages/ContactPage.jsx";
import { MessagesPage } from "@/pages/MessagesPage.jsx";
import { ToolsHubPage } from "@/pages/ToolsHubPage.jsx";
import { AdminSection } from "@/layouts/AdminSection.jsx";
import {
  SurveyPage,
  VacacionesPage,
  WorksheetPage,
  AnalysisPage,
  AdminOverviewPage,
  AdminUsersPage,
  AdminSalesPage,
  AdminAgendaPage,
  AdminGoalsPage,
  AdminActivityPage,
  AdminWorksheetsPage,
  AdminWorksheetDetailPage,
} from "@/routes/lazy-pages.js";

function Lazy({ children }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function ClientDetailRoute() {
  const { id } = useParams();
  return <ClientDetail id={id} />;
}

function ClientToolRoute({ tool }) {
  const { id } = useParams();
  if (tool === "survey") return <Lazy><SurveyPage clientId={id} /></Lazy>;
  if (tool === "vacaciones") return <Lazy><VacacionesPage clientId={id} /></Lazy>;
  if (tool === "worksheet") return <Lazy><WorksheetPage clientId={id} /></Lazy>;
  if (tool === "analysis") return <Lazy><AnalysisPage clientId={id} /></Lazy>;
  return null;
}

function SharedToolRoute({ tool }) {
  const { contactId, prospectId } = useParams();
  const shared = { prospectId, contactId };
  if (tool === "survey") return <Lazy><SurveyPage shared={shared} /></Lazy>;
  if (tool === "vacaciones") return <Lazy><VacacionesPage shared={shared} /></Lazy>;
  if (tool === "worksheet") return <Lazy><WorksheetPage shared={shared} /></Lazy>;
  if (tool === "analysis") return <Lazy><AnalysisPage shared={shared} /></Lazy>;
  return null;
}

function SharedClientDetailRoute() {
  const { contactId, prospectId } = useParams();
  return (
    <ClientDetail
      id={prospectId}
      sharedRemote
      contactId={contactId}
      backHref={`/red/contacto/${contactId}`}
    />
  );
}

function ContactRoute() {
  const { contactId } = useParams();
  return <ContactPage contactId={contactId} />;
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
        <Route path="sales" element={<SalesHistoryPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:id" element={<ClientDetailRoute />} />
        <Route path="clients/:id/survey" element={<ClientToolRoute tool="survey" />} />
        <Route path="clients/:id/vacaciones" element={<ClientToolRoute tool="vacaciones" />} />
        <Route path="clients/:id/worksheet" element={<ClientToolRoute tool="worksheet" />} />
        <Route path="clients/:id/analysis" element={<ClientToolRoute tool="analysis" />} />
        <Route path="network" element={<NetworkPage />} />
        <Route path="red/contacto/:contactId" element={<ContactRoute />} />
        <Route path="red/contacto/:contactId/expediente/:prospectId" element={<SharedClientDetailRoute />} />
        <Route path="red/contacto/:contactId/expediente/:prospectId/survey" element={<SharedToolRoute tool="survey" />} />
        <Route path="red/contacto/:contactId/expediente/:prospectId/vacaciones" element={<SharedToolRoute tool="vacaciones" />} />
        <Route path="red/contacto/:contactId/expediente/:prospectId/worksheet" element={<SharedToolRoute tool="worksheet" />} />
        <Route path="red/contacto/:contactId/expediente/:prospectId/analysis" element={<SharedToolRoute tool="analysis" />} />
        <Route path="network/shared/:id" element={<Navigate to="/network" replace />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="tools" element={<ToolsHubPage />} />
        <Route path="tools/survey" element={<Lazy><SurveyPage /></Lazy>} />
        <Route path="tools/vacaciones" element={<Lazy><VacacionesPage /></Lazy>} />
        <Route path="tools/worksheet" element={<Lazy><WorksheetPage /></Lazy>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminSection />}>
          <Route index element={<Lazy><AdminOverviewPage /></Lazy>} />
          <Route path="users" element={<Lazy><AdminUsersPage /></Lazy>} />
          <Route path="sales" element={<Lazy><AdminSalesPage /></Lazy>} />
          <Route path="agenda" element={<Lazy><AdminAgendaPage /></Lazy>} />
          <Route path="goals" element={<Lazy><AdminGoalsPage /></Lazy>} />
          <Route path="activity" element={<Lazy><AdminActivityPage /></Lazy>} />
          <Route path="worksheets" element={<Lazy><AdminWorksheetsPage /></Lazy>} />
          <Route path="worksheets/:id" element={<Lazy><AdminWorksheetDetailPage /></Lazy>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
