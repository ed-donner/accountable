import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The API is local. A 4xx answer, such as a deleted record's 404, won't
      // change on a retry, so only server errors are tried again, once.
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status !== undefined && status < 500) return false;
        return failureCount < 1;
      },
      staleTime: 0,
    },
  },
});
