import type { DefaultOptions } from "@tanstack/react-query";

// The local copy runs with no internet, so the browser reporting it's offline must not pause anything.
export const queryDefaults: DefaultOptions = {
  queries: { networkMode: "always", retry: false, refetchOnWindowFocus: true },
  mutations: { networkMode: "always" },
};
