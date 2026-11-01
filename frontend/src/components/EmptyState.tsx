import type { ReactNode } from "react";

export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-muted">{message}</p>
      {children}
    </div>
  );
}
