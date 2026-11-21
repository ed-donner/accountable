import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react";
import { useMode } from "@/lib/mode";

// Messages are raised panels that follow the mode (spec 2.6, concern 14).
const Toaster = ({ ...props }: ToasterProps) => {
  const mode = useMode();
  return (
    <Sonner
      theme={mode}
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
          "--normal-bg": "var(--raised)",
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
