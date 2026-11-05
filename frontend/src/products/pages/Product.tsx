import { Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";

import { Chip } from "../../components/Chip";
import { LoadFailed } from "../../components/LoadFailed";
import { MissingRecord } from "../../components/MissingRecord";
import {
  AddedAndChanged,
  Detail,
  RecordColumns,
  RecordHeader,
  SidePanel,
  type HeaderAction,
} from "../../components/RecordLayout";
import { ApiError } from "../../lib/api";
import { price } from "../../lib/money";
import { recordId } from "../../lib/validate";
import { ProductForm } from "../ProductForm";
import { useProduct, useSetActive } from "../queries";

export function Product() {
  const id = recordId(useParams().id);
  if (id === null) return <MissingRecord word="product" to="/products" section="Products" />;
  return <ProductRecord id={id} />;
}

function ProductRecord({ id }: { id: number }) {
  const product = useProduct(id);
  const { setActive, pending } = useSetActive();
  const [editing, setEditing] = useState(false);

  if (product.error instanceof ApiError && product.error.kind === "missing") {
    return <MissingRecord word="product" to="/products" section="Products" />;
  }
  if (!product.data) return <LoadFailed onPage error={product.error} onRetry={() => product.refetch()} />;
  const record = product.data;
  // Archiving or restoring stays on the page (G11).
  const action: HeaderAction = record.active
    ? { label: "Archive", icon: <Archive size={15} aria-hidden="true" />, onClick: () => setActive(id, false), pending }
    : {
        label: "Restore",
        icon: <ArchiveRestore size={15} aria-hidden="true" />,
        onClick: () => setActive(id, true),
        pending,
      };

  return (
    <>
      <RecordHeader
        title={record.name}
        chips={!record.active && <Chip tone="archived">Archived</Chip>}
        onEdit={() => setEditing(true)}
        action={action}
      />
      <LoadFailed onPage keeping error={product.error} onRetry={() => product.refetch()} />
      <RecordColumns
        side={
          <SidePanel title="Details">
            <p className="num text-[24px] leading-[30px] font-medium tracking-[-0.02em]">
              {price(record.unit_price_cents)}
            </p>
            <dl className="mt-1">
              <Detail label="Status">{record.active ? "Active" : "Archived"}</Detail>
            </dl>
            <AddedAndChanged record={record} />
          </SidePanel>
        }
      >
        <SidePanel title="Description">
          {record.description ? (
            <p className="whitespace-pre-wrap">{record.description}</p>
          ) : (
            <p className="text-muted">No description.</p>
          )}
        </SidePanel>
      </RecordColumns>
      {editing && <ProductForm record={record} onClose={() => setEditing(false)} />}
    </>
  );
}
