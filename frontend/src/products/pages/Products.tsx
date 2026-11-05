import { Archive, ArchiveRestore } from "lucide-react";
import { useMemo, useState } from "react";

import { Chip } from "../../components/Chip";
import { DataTable, type HiddenRows, type RowAction, type TableColumn } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { price } from "../../lib/money";
import { plural } from "../../lib/words";
import { ProductForm } from "../ProductForm";
import { useProducts, useSetActive, type ProductRow } from "../queries";

/** Archived products stay out of the table until Show archived is ticked (G6, G7). */
const ARCHIVED: HiddenRows<ProductRow> = {
  which: (row) => !row.active,
  param: "archived",
  label: "Show archived",
  allHidden: "Every product is archived.",
  hiddenMatch: (count) => `${plural(count, "archived product")} ${count === 1 ? "matches" : "match"}.`,
};

export function Products() {
  const products = useProducts();
  const { setActive } = useSetActive();
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);

  const columns = useMemo<TableColumn<ProductRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        value: (row) => row.name,
        searchable: true,
        cell: (row) => (
          <span className="flex items-center gap-2">
            <span className="truncate">{row.name}</span>
            {!row.active && <Chip tone="archived">Archived</Chip>}
          </span>
        ),
      },
      { id: "description", header: "Description", value: (row) => row.description, searchable: true },
      {
        id: "unit_price",
        header: "Unit price",
        value: (row) => row.unit_price_cents,
        numeric: true,
        width: "w-[160px]",
        cell: (row) => price(row.unit_price_cents),
      },
    ],
    [],
  );

  function archiveOrRestore(row: ProductRow): RowAction {
    return row.active
      ? { label: "Archive", icon: <Archive size={16} aria-hidden="true" />, onClick: () => setActive(row.id, false) }
      : {
          label: "Restore",
          icon: <ArchiveRestore size={16} aria-hidden="true" />,
          onClick: () => setActive(row.id, true),
        };
  }

  return (
    <>
      <PageHeader title="Products">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          Add product
        </button>
      </PageHeader>
      <DataTable
        noun="product"
        rows={products.data}
        error={products.error}
        onRetry={() => products.refetch()}
        columns={columns}
        defaultSort={{ id: "name", desc: false }}
        rowId={(row) => row.id}
        rowName={(row) => row.name}
        rowHref={(row) => `/products/${row.id}`}
        onAdd={() => setEditing("new")}
        onEdit={setEditing}
        rowAction={archiveOrRestore}
        hidden={ARCHIVED}
      />
      {editing && <ProductForm record={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
