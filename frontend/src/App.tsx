import { useEffect } from "react";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { MissingRecord } from "./components/MissingRecord";
import { Shell } from "./components/Shell";
import { SignedIn } from "./components/SignIn";
import { Contact } from "./crm/pages/Contact";
import { Dashboard } from "./crm/pages/Dashboard";
import { Contacts } from "./crm/pages/Contacts";
import { Deal } from "./crm/pages/Deal";
import { Deals } from "./crm/pages/Deals";
import { Organization } from "./crm/pages/Organization";
import { Organizations } from "./crm/pages/Organizations";
import { Pipeline } from "./crm/pages/Pipeline";
import { useMeta } from "./crm/queries";
import { Search } from "./crm/Search";
import { applyTheme, savedTheme } from "./lib/theme";

function AppShell() {
  useMeta(); // Fetched early, because it never changes and forms need it straight away.
  return <Shell search={<Search />} />;
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
