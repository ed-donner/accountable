import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import "./shared/theme/fonts";
import "./shared/theme/global.css";
import "./shared/theme/components.css";
import App from "./App";
import { makeQueryClient } from "./shared/queryClient";
import { ToastProvider } from "./shared/Toast";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={makeQueryClient()}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
