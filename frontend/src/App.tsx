import { QueryClient, QueryClientProvider, type DefaultOptions } from "@tanstack/react-query";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { MissingRecord } from "./components/MissingRecord";
import { Shell } from "./components/Shell";
import { Contact } from "./crm/pages/Contact";
import { Dashboard } from "./crm/pages/Dashboard";
import { Contacts } from "./crm/pages/Contacts";
import { Deal } from "./crm/pages/Deal";
import { Deals } from "./crm/pages/Deals";
import { Organization } from "./crm/pages/Organization";
import { Organizations } from "./crm/pages/Organizations";
import { Pipeline } from "./crm/pages/Pipeline";
import { useMeta } from "./crm/queries";

// The backend is on this computer, so losing Wi-Fi must not pause anything.
export const queryDefaults: DefaultOptions = {
  queries: { networkMode: "always", retry: false, refetchOnWindowFocus: true },
  mutations: { networkMode: "always" },
};

export const queryClient = new QueryClient({ defaultOptions: queryDefaults });

function AppShell() {
  useMeta(); // Fetched early, because it never changes and forms need it straight away.
  return <Shell />;
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/organizations", element: <Organizations /> },
      { path: "/organizations/:id", element: <Organization /> },
      { path: "/contacts", element: <Contacts /> },
      { path: "/contacts/:id", element: <Contact /> },
      { path: "/deals", element: <Deals /> },
      { path: "/deals/:id", element: <Deal /> },
      { path: "/pipeline", element: <Pipeline /> },
      { path: "*", element: <MissingRecord word="page" to="/" section="Dashboard" /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
