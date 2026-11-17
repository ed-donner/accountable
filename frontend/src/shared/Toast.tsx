import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CircleAlert, Check, X } from "lucide-react";

type Toast = { id: number; message: string; kind: "error" | "success" };
type ToastApi = { error: (message: string) => void; success: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (message: string, kind: Toast["kind"]) => {
      const id = nextId++;
      setToasts((all) => [...all.slice(-2), { id, message, kind }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : 3500);
    },
    [dismiss],
  );
  const [value] = useState<ToastApi>(() => ({
    error: (message) => show(message, "error"),
    success: (message) => show(message, "success"),
  }));

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            {toast.kind === "error" ? <CircleAlert size={16} /> : <Check size={16} />}
            <span>{toast.message}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast needs a ToastProvider");
  return toast;
}
