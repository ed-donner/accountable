import { FileText, Package, Receipt, ReceiptText } from "lucide-react";
import { useEffect } from "react";
import { Navigate, createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { BillsPanel } from "./bills/BillsPanel";
import { BillsMoney } from "./bills/charts/MoneySection";
import { ACCOUNTING_LINKS } from "./books/links";
import { AgedBalances } from "./aging/AgedBalances";
import { BalanceSheet } from "./books/pages/BalanceSheet";
import { Journal } from "./books/pages/Journal";
import { ProfitAndLoss } from "./books/pages/ProfitAndLoss";
import { CashFlowRow } from "./cashflow/CashFlowRow";
import { Bill } from "./bills/pages/Bill";
import { Bills } from "./bills/pages/Bills";
import { SettingsPage } from "./company/SettingsPage";
import { Icon } from "./components/Icon";
import { MissingRecord } from "./components/MissingRecord";
import { MoneySection } from "./components/MoneySection";
import type { RecordPanel } from "./components/RecordLayout";
import { Search } from "./components/Search";
import { Shell, type Section } from "./components/Shell";
import { SignedIn } from "./components/SignIn";
import { Contact } from "./crm/pages/Contact";
import { Dashboard, type DashboardSection } from "./crm/pages/Dashboard";
import { Contacts } from "./crm/pages/Contacts";
import { Deal } from "./crm/pages/Deal";
import { Deals } from "./crm/pages/Deals";
import { Organization } from "./crm/pages/Organization";
import { Organizations } from "./crm/pages/Organizations";
import { Pipeline } from "./crm/pages/Pipeline";
import { useMeta, type DealDetail, type OrganizationDetail } from "./crm/queries";
import { crmSearchGroups } from "./crm/searchGroups";
import { SampleInvoice } from "./invoices/SampleInvoice";
import { InvoicesMoney } from "./invoices/MoneySection";
import { Invoice } from "./invoices/pages/Invoice";
import { Invoices } from "./invoices/pages/Invoices";
import { DealInvoices, OrganizationInvoices } from "./invoices/panels";
import { applyTheme, savedTheme } from "./lib/theme";
import { Product } from "./products/pages/Product";
import { Products } from "./products/pages/Products";
import { productsSearchGroups } from "./products/searchGroups";
import { NewDraft, Quote } from "./quotes/pages/Quote";
import { Quotes } from "./quotes/pages/Quotes";
import { dealQuotesPanel, organizationQuotesPanel } from "./quotes/panels";

const ICON_SIZE = 17;

// The top bar's sections, area by area. The design reference has icons for the CRM's.
// Products, Quotes, Invoices and Bills take lucide's, drawn as Icon draws its own.
const SECTIONS: Section[] = [
  { to: "/", label: "Dashboard", icon: <Icon name="dashboard" size={ICON_SIZE} /> },
  { to: "/organizations", label: "Organizations", icon: <Icon name="organizations" size={ICON_SIZE} /> },
  { to: "/contacts", label: "Contacts", icon: <Icon name="contacts" size={ICON_SIZE} /> },
  { to: "/deals", label: "Deals", icon: <Icon name="deals" size={ICON_SIZE} /> },
  { to: "/pipeline", label: "Pipeline", icon: <Icon name="pipeline" size={ICON_SIZE} /> },
  {
    to: "/products",
    label: "Products",
    icon: <Package size={ICON_SIZE} strokeWidth={1.75} className="flex-none" aria-hidden="true" />,
  },
  {
    to: "/quotes",
    label: "Quotes",
    icon: <FileText size={ICON_SIZE} strokeWidth={1.75} className="flex-none" aria-hidden="true" />,
  },
  {
    to: "/invoices",
    label: "Invoices",
    icon: <ReceiptText size={ICON_SIZE} strokeWidth={1.75} className="flex-none" aria-hidden="true" />,
  },
  {
    to: "/bills",
    label: "Bills",
    icon: <Receipt size={ICON_SIZE} strokeWidth={1.75} className="flex-none" aria-hidden="true" />,
  },
];

const SEARCH_GROUPS = [...crmSearchGroups, ...productsSearchGroups];

// What later areas add to the CRM's pages, such as a deal's quotes, an organization's bills
// or a section of the dashboard (R7, H10).
const DEAL_PANELS: RecordPanel<DealDetail>[] = [dealQuotesPanel, { name: "invoices", Panel: DealInvoices }];
const ORGANIZATION_PANELS: RecordPanel<OrganizationDetail>[] = [
  organizationQuotesPanel,
  { name: "invoices", Panel: OrganizationInvoices },
  { name: "bills", Panel: BillsPanel },
];

/**
 * One Money section, below the dashboard's own part: the cash flow across its top, then what
 * customers owe us, from invoices, beside what we owe, from bills.
 */
function Money() {
  return (
    <MoneySection lead={<CashFlowRow />}>
      <InvoicesMoney />
      <BillsMoney />
    </MoneySection>
  );
}

const DASHBOARD_SECTIONS: DashboardSection[] = [{ name: "money", Section: Money }];

// Each group of links in the user's menu, after the themes.
const MENU_LINKS = [ACCOUNTING_LINKS];

function AppShell() {
  useMeta(); // Fetched early, because it never changes and forms need it straight away.
  return <Shell sections={SECTIONS} search={<Search groups={SEARCH_GROUPS} />} menuLinks={MENU_LINKS} />;
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Dashboard sections={DASHBOARD_SECTIONS} /> },
      { path: "/organizations", element: <Organizations /> },
      { path: "/organizations/:id", element: <Organization panels={ORGANIZATION_PANELS} /> },
      { path: "/contacts", element: <Contacts /> },
      { path: "/contacts/:id", element: <Contact /> },
      { path: "/deals", element: <Deals /> },
      { path: "/deals/:id", element: <Deal panels={DEAL_PANELS} /> },
      { path: "/pipeline", element: <Pipeline /> },
      { path: "/products", element: <Products /> },
      { path: "/products/:id", element: <Product /> },
      { path: "/quotes", element: <Quotes /> },
      { path: "/quotes/new", element: <NewDraft /> },
      { path: "/quotes/:id", element: <Quote /> },
      { path: "/invoices", element: <Invoices /> },
      { path: "/invoices/:id", element: <Invoice /> },
      { path: "/bills", element: <Bills /> },
      { path: "/bills/:id", element: <Bill /> },
      { path: "/accounting", element: <Navigate to="/accounting/profit-and-loss" replace /> },
      { path: "/accounting/profit-and-loss", element: <ProfitAndLoss /> },
      { path: "/accounting/balance-sheet", element: <BalanceSheet /> },
      { path: "/accounting/journal", element: <Journal /> },
      { path: "/accounting/aged-balances", element: <AgedBalances /> },
      { path: "/settings", element: <SettingsPage preview={SampleInvoice} /> },
      { path: "*", element: <MissingRecord word="page" to="/" section="Dashboard" /> },
    ],
  },
]);

export function App() {
  // index.html has already put the saved theme's mode on the page. This keeps System following the device.
  useEffect(() => applyTheme(savedTheme()), []);

  // The router is made once, outside SignedIn, so signing in opens the address the app was opened at.
  // SignedIn gives each session its own query cache.
  return (
    <SignedIn>
      <RouterProvider router={router} />
    </SignedIn>
  );
}
