import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Field } from "../components/Field";
import { FormDialog } from "../components/FormDialog";
import { parsePrice, priceText } from "../lib/money";
import { useNotify } from "../lib/notify";
import { showSaveError } from "../lib/saveErrors";
import { useSaveProduct, type Product } from "./queries";

const PRICE_MESSAGE = "Enter a price in dollars and cents, such as 49.50";
// The backend's limit, which keeps a name's key inside what Postgres can index (G2).
const MAX_NAME_LENGTH = 200;
const NAME_TOO_LONG = `Keep the name to ${MAX_NAME_LENGTH} characters or fewer`;

// The price box is called unit_price_cents, as the API's field is, so the API's
// message for it lands beside the box. It holds what was typed, which becomes cents on sending.
const schema = z.object({
  // zod counts characters, as the backend does, where length would count some, such as emoji, as two.
  name: z.string().trim().min(1, "Enter a name").max(MAX_NAME_LENGTH, NAME_TOO_LONG),
  description: z.string().trim(),
  unit_price_cents: z.string().refine((text) => parsePrice(text) !== null, PRICE_MESSAGE),
});

type Values = z.infer<typeof schema>;

function initialValues(record?: Product): Values {
  return {
    name: record?.name ?? "",
    description: record?.description ?? "",
    unit_price_cents: record ? priceText(record.unit_price_cents) : "",
  };
}

/** Adding and editing a product (G8). There's no Active box: Archive and Restore change that. */
export function ProductForm({ record, onClose }: { record?: Product; onClose: () => void }) {
  const save = useSaveProduct(record?.id);
  const notify = useNotify();
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initialValues(record) });

  async function submit(values: Values) {
    try {
      await save.mutateAsync({
        name: values.name,
        description: values.description || null,
        unit_price_cents: parsePrice(values.unit_price_cents)!,
      });
      notify.success("Product saved.");
      onClose();
    } catch (error) {
      showSaveError(error, { setError, getValues, notify });
    }
  }

  return (
    <FormDialog
      title={record ? "Edit product" : "Add product"}
      submitLabel="Save product"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <Field label="Name" htmlFor="product-name" error={errors.name?.message}>
        <input id="product-name" className="input" aria-invalid={!!errors.name} {...register("name")} />
      </Field>
      <Field label="Description" htmlFor="product-description" error={errors.description?.message}>
        <textarea id="product-description" rows={4} className="input" {...register("description")} />
      </Field>
      <Field label="Unit price" htmlFor="product-price" error={errors.unit_price_cents?.message}>
        <div className="relative">
          <span aria-hidden="true" className="num pointer-events-none absolute top-[9px] left-3 text-muted">
            $
          </span>
          <input
            id="product-price"
            inputMode="decimal"
            className="input num pl-7"
            aria-invalid={!!errors.unit_price_cents}
            {...register("unit_price_cents")}
          />
        </div>
      </Field>
    </FormDialog>
  );
}
