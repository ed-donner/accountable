import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppShell } from './components/AppShell'
import { ToastProvider } from './components/Toast'
import { ContactPage } from './features/contacts/ContactPage'
import { ContactsPage } from './features/contacts/ContactsPage'
import { DealPage } from './features/deals/DealPage'
import { DealsPage } from './features/deals/DealsPage'
import { OrganizationPage } from './features/organizations/OrganizationPage'
import { OrganizationsPage } from './features/organizations/OrganizationsPage'
import { OverviewPage } from './features/overview/OverviewPage'
import { PipelinePage } from './features/pipeline/PipelinePage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

// D15: every page has its own URL, so refresh and the back button work.
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'pipeline', element: <PipelinePage /> },
      { path: 'deals', element: <DealsPage /> },
      { path: 'deals/:id', element: <DealPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'contacts/:id', element: <ContactPage /> },
      { path: 'organizations', element: <OrganizationsPage /> },
      { path: 'organizations/:id', element: <OrganizationPage /> },
    ],
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  )
}
