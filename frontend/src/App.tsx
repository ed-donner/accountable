import { Route, Routes } from "react-router";
import { Layout } from "@/components/layout/Layout";
import DashboardPage from "@/pages/DashboardPage";
import OrganizationsPage from "@/pages/OrganizationsPage";
import OrganizationPage from "@/pages/OrganizationPage";
import ContactsPage from "@/pages/ContactsPage";
import ContactPage from "@/pages/ContactPage";
import DealsPage from "@/pages/DealsPage";
import DealPage from "@/pages/DealPage";
import PipelinePage from "@/pages/PipelinePage";
import NotFoundPage from "@/pages/NotFoundPage";

// No lazy-loaded routes, so Vite finds every dependency when it starts (plan, risk 9).
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="organizations" element={<OrganizationsPage />} />
        <Route path="organizations/:id" element={<OrganizationPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactPage />} />
        <Route path="deals" element={<DealsPage />} />
        <Route path="deals/:id" element={<DealPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
