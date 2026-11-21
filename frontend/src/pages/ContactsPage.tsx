import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useContacts } from "@/api/contacts";
import type { Contact } from "@/api/types";
import { StatusBadge } from "@/components/Badges";
import { DataTable, NameLink, type TableColumn } from "@/components/DataTable";
import { DeleteDialog, type DeleteTarget } from "@/components/DeleteDialog";
import { ContactForm } from "@/components/forms/ContactForm";
import { Band } from "@/components/layout/Band";
import { PageBody } from "@/components/layout/PageBody";
import { EmailLink, PhoneLink, RecordLink } from "@/components/links";
import { Button } from "@/components/ui/button";
import { plural } from "@/lib/format";
import { STATUSES, type Status } from "@/lib/rules";
import { cn } from "@/lib/utils";

const columns: TableColumn<Contact>[] = [
  {
    id: "name",
    header: "Name",
    cell: (contact) => <NameLink to={`/contacts/${contact.id}`}>{contact.name}</NameLink>,
    sortValue: (contact) => contact.name,
  },
  {
    id: "status",
    header: "Status",
    cell: (contact) => <StatusBadge status={contact.status} />,
    sortValue: (contact) => STATUSES.indexOf(contact.status),
  },
  {
    id: "organization",
    header: "Organization",
    cell: (contact) =>
      contact.organization && (
        <RecordLink to={`/organizations/${contact.organization.id}`}>{contact.organization.name}</RecordLink>
      ),
    sortValue: (contact) => contact.organization?.name ?? null,
  },
  {
    id: "job_title",
    header: "Job title",
    cell: (contact) => contact.job_title,
    sortValue: (contact) => contact.job_title,
  },
  {
    id: "email",
    header: "Email",
    cell: (contact) => <EmailLink email={contact.email} />,
    sortValue: (contact) => contact.email,
  },
  {
    id: "phone",
    header: "Phone",
    cell: (contact) => <PhoneLink phone={contact.phone} />,
    sortValue: (contact) => contact.phone,
  },
];

const FILTERS: { value: Status | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lead", label: "Leads" },
  { value: "qualified", label: "Qualified" },
  { value: "customer", label: "Customers" },
];

export default function ContactsPage() {
  const contacts = useContacts();
  const [status, setStatus] = useState<Status | "all">("all");
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  // Each status's count covers every contact, whatever the search says (plan, decision 17).
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: contacts.data?.length ?? 0 };
    for (const contact of contacts.data ?? []) result[contact.status] = (result[contact.status] ?? 0) + 1;
    return result;
  }, [contacts.data]);
  const filter = useCallback((contact: Contact) => status === "all" || contact.status === status, [status]);

  const addButton = (
    <Button onClick={() => setEditing("new")}>
      <Plus /> Add contact
    </Button>
  );

  const statusFilter = (
    <div role="group" aria-label="Filter by status" className="inline-flex rounded-lg bg-panel p-1 shadow-soft">
      {FILTERS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={status === option.value}
          onClick={() => setStatus(option.value)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors duration-150",
            // Filled like the chosen Note, Call or Email type (spec 2.5).
            status === option.value ? "bg-selected text-selected-ink" : "text-ink-muted hover:bg-accent hover:text-ink",
          )}
        >
          {option.label}
          <span
            className={cn(
              "font-mono text-[12px] tabular",
              status === option.value ? "text-selected-muted" : "text-ink-subtle",
            )}
          >
            {counts[option.value] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <title>Contacts · Accountable</title>
      <Band
        title="Contacts"
        subtitle={contacts.data ? plural(contacts.data.length, "contact") : " "}
        right={addButton}
      />
      <PageBody>
        <DataTable
          rows={contacts.data}
          columns={columns}
          searchFields={(contact) => [
            contact.name,
            contact.email,
            contact.phone,
            contact.job_title,
            contact.organization?.name,
          ]}
          searchLabel="Search contacts"
          noun="contact"
          initialSort={{ id: "name", desc: false }}
          hrefOf={(contact) => `/contacts/${contact.id}`}
          nameOf={(contact) => contact.name}
          onEdit={setEditing}
          onDelete={(contact) => setDeleting({ kind: "contact", id: contact.id, name: contact.name })}
          filter={filter}
          filters={statusFilter}
          emptyAction={addButton}
        />
      </PageBody>
      <ContactForm
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        contact={editing === "new" || editing === null ? undefined : editing}
      />
      <DeleteDialog target={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  );
}
