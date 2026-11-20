import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { safeHref } from "@/lib/rules";
import { cn } from "@/lib/utils";

/** A website that opens in a new tab. Only http and https become links (spec 1.3). */
export function WebsiteLink({ website, className }: { website: string | null; className?: string }) {
  if (!website) return null;
  const href = safeHref(website);
  if (!href) return <span className={className}>{website}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 text-cerulean-text hover:underline", className)}
    >
      {website}
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** A link to a record, in Cerulean's text shade (spec 2.6). */
export function RecordLink({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) {
  return (
    <Link to={to} className={cn("text-cerulean-text hover:underline", className)}>
      {children}
    </Link>
  );
}

export function EmailLink({ email, className }: { email: string | null; className?: string }) {
  if (!email) return null;
  return (
    <a href={`mailto:${email}`} className={cn("text-cerulean-text hover:underline", className)}>
      {email}
    </a>
  );
}

export function PhoneLink({ phone, className }: { phone: string | null; className?: string }) {
  if (!phone) return null;
  return (
    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={cn("text-cerulean-text hover:underline", className)}>
      {phone}
    </a>
  );
}
