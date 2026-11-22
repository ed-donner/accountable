import { Route, Routes } from "react-router-dom";
import { Layout } from "./shared/Layout";
import { NotFound } from "./shared/NotFound";
import { DashboardPage } from "./dashboard/DashboardPage";
import { PipelinePage } from "./pipeline/PipelinePage";
import { DealsPage } from "./deals/DealsPage";
import { DealPage } from "./deals/DealPage";
import { ContactsPage } from "./contacts/ContactsPage";
import { ContactPage } from "./contacts/ContactPage";
import { OrganizationsPage } from "./organizations/OrganizationsPage";
import { OrganizationPage } from "./organizations/OrganizationPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="deals" element={<DealsPage />} />
        <Route path="deals/:id" element={<DealPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactPage />} />
        <Route path="organizations" element={<OrganizationsPage />} />
        <Route path="organizations/:id" element={<OrganizationPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
