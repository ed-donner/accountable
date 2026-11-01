import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { DataTable, type TableColumn } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { formatDate } from "../../lib/dates";
import type { AddressChange } from "../../lib/useAddress";
import { capitalize } from "../../lib/words";
import { ContactForm } from "../forms/ContactForm";
import { DeleteContact } from "../forms/DeleteDialogs";
import { useContacts, type ContactRow, type Status } from "../queries";
import { StatusChip } from "../StageChip";

const STATUS_ORDER: Status[] = ["lead", "qualified", "customer"];

export function Contacts() {
  const contacts = useContacts();
  const [params] = useSearchParams();
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<ContactRow | null>(null);

  const status = STATUS_ORDER.find((item) => item === params.get("status")) ?? null;

  const rows = useMemo(
    () => (status ? contacts.data?.filter((row) => row.status === status) : contacts.data),
    [contacts.data, status],
  );

  const columns = useMemo<TableColumn<ContactRow>[]>(
    () => [
      { id: "name", header: "Name", value: (row) => row.name, searchable: true },
      {
        id: "organization",
        header: "Organization",
        value: (row) => row.organization_name,
        searchable: true,
        cell: (row) => row.organization_name ?? <span className="text-muted">None</span>,
      },
      { id: "job_title", header: "Job title", value: (row) => row.job_title, searchable: true },
      { id: "email", header: "Email", value: (row) => row.email, searchable: true },
      {
        id: "phone",
        header: "Phone",
        value: (row) => row.phone,
        searchable: true,
        width: "w-[150px]",
        cell: (row) => <span className="num text-[13px]">{row.phone}</span>,
      },
      {
        id: "status",
        header: "Status",
        value: (row) => row.status,
        searchable: true,
        sortValue: (row) => STATUS_ORDER.indexOf(row.status),
        width: "w-[110px]",
        cell: (row) => <StatusChip status={row.status} />,
      },
      {
        id: "last_activity",
        header: "Last activity",
        value: (row) => row.last_activity,
        numeric: true,
        width: "w-[130px]",
        cell: (row) => (row.last_activity ? formatDate(row.last_activity) : ""),
      },
    ],
    [],
  );

  const count = (wanted: Status | null) =>
    wanted === null ? (contacts.data?.length ?? 0) : (contacts.data ?? []).filter((row) => row.status === wanted).length;

  const options: (Status | null)[] = [null, ...STATUS_ORDER];

  const filters = (update: (change: AddressChange) => void): ReactNode => (
    <div role="group" aria-label="Filter by status" className="flex gap-1 rounded-control bg-panel p-1">
      {options.map((option) => {
        const on = option === status;
        return (
          <button
            key={option ?? "all"}
            type="button"
            aria-pressed={on}
            onClick={() =>
              update((address) => {
                if (option) address.set("status", option);
                else address.delete("status");
                address.delete("page");
              })
            }
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-semibold ${on ? "bg-sea-green" : "hover:bg-page"}`}
          >
            {option ? capitalize(option) : "All"}
            <span className="num font-normal">{count(option)}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <PageHeader title="Contacts">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          Add contact
        </button>
      </PageHeader>
      <DataTable
        noun="contact"
        rows={rows}
        columns={columns}
        defaultSort={{ id: "name", desc: false }}
        rowId={(row) => row.id}
        rowName={(row) => row.name}
        rowHref={(row) => `/contacts/${row.id}`}
        onAdd={() => setEditing("new")}
        onEdit={setEditing}
        onDelete={setDeleting}
        filters={filters}
        filtered={status !== null}
        clearParams={["status"]}
      />
      {editing && <ContactForm record={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteContact id={deleting.id} name={deleting.name} onClose={() => setDeleting(null)} />}
    </>
  );
}
