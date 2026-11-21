import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Band } from "./Band";

type Props = {
  back: { to: string; label: string };
  title: ReactNode;
  badges?: ReactNode;
  /** The record's links, such as its organization and main contact. */
  links?: ReactNode;
  figures?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  kind: string;
  children?: ReactNode;
};

/** A record page's band: a link back to the table, the name with its badges, its links, and Edit and Delete (spec 2.5). */
export function RecordBand({ back, title, badges, links, figures, onEdit, onDelete, kind, children }: Props) {
  return (
    <Band
      above={
        <Link
          to={back.to}
          className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-band-muted hover:text-band-ink"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      }
      title={title}
      beside={badges}
      subtitle={links ?? undefined}
      right={
        <>
          {figures}
          <div className="flex gap-2">
            <Button variant="band" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
            <Button variant="delete" onClick={onDelete}>
              <Trash2 /> Delete {kind}
            </Button>
          </div>
        </>
      }
    >
      {children}
    </Band>
  );
}

/** A figure on a record page's band. */
export function RecordFigure({ label, value, tone }: { label: string; value: ReactNode; tone?: "sea" }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[13px] font-medium text-band-muted">{label}</span>
      <span
        className={
          tone === "sea"
            ? "font-mono text-[26px] leading-[34px] text-sea-green tabular"
            : "font-mono text-[26px] leading-[34px] text-band-ink tabular"
        }
      >
        {value}
      </span>
    </div>
  );
}
