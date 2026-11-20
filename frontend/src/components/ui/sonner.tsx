import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react";

// Light mode only for the MVP, so there's no theme switching here.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="bottom-right"
      icons={{
        success: <CircleCheckIcon className="size-4 text-sea-green-text" />,
        info: <InfoIcon className="size-4 text-cerulean-text" />,
        warning: <TriangleAlertIcon className="size-4 text-marigold-text" />,
        error: <OctagonXIcon className="size-4 text-raspberry-text" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--panel)",
          "--normal-text": "var(--ink)",
          "--normal-border": "transparent",
          "--border-radius": "12px",
        } as React.CSSProperties
      }
      toastOptions={{
        style: { boxShadow: "var(--shadow-lifted)", fontFamily: "var(--font-sans)", fontSize: "14px" },
      }}
      {...props}
    />
  );
};

export { Toaster };
