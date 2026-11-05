import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Field } from "../../components/Field";
import { FormDialog } from "../../components/FormDialog";
import { useNotify } from "../../lib/notify";
import { showSaveError } from "../../lib/saveErrors";
import { WEBSITE_MESSAGE, isWebsite } from "../../lib/validate";
import { useSaveOrganization, type Organization, type OrganizationDetail } from "../queries";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  website: z
    .string()
    .trim()
    .refine((value) => value === "" || isWebsite(value), WEBSITE_MESSAGE),
  industry: z.string().trim(),
  notes: z.string().trim(),
});

type Values = z.infer<typeof schema>;

type Props = {
  record?: Organization;
  defaultName?: string;
  onClose: () => void;
  onSaved?: (saved: OrganizationDetail) => void;
};

function initialValues(record?: Organization, defaultName?: string): Values {
  return {
    name: record?.name ?? defaultName ?? "",
    website: record?.website ?? "",
    industry: record?.industry ?? "",
    notes: record?.notes ?? "",
  };
}

export function OrganizationForm({ record, defaultName, onClose, onSaved }: Props) {
  const save = useSaveOrganization(record?.id);
  const notify = useNotify();
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initialValues(record, defaultName) });

  async function submit(values: Values) {
    try {
      const saved = await save.mutateAsync({
        name: values.name,
        website: values.website || null,
        industry: values.industry || null,
        notes: values.notes || null,
      });
      notify.success("Organization saved.");
      onSaved?.(saved);
      onClose();
    } catch (error) {
      showSaveError(error, { setError, getValues, notify });
    }
  }

  return (
    <FormDialog
      title={record ? "Edit organization" : "Add organization"}
      submitLabel="Save organization"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <Field label="Name" htmlFor="organization-name" error={errors.name?.message}>
        <input id="organization-name" className="input" aria-invalid={!!errors.name} {...register("name")} />
      </Field>
      <Field label="Website" htmlFor="organization-website" error={errors.website?.message}>
        <input id="organization-website" className="input" aria-invalid={!!errors.website} {...register("website")} />
      </Field>
      <Field label="Industry" htmlFor="organization-industry" error={errors.industry?.message}>
        <input id="organization-industry" className="input" {...register("industry")} />
      </Field>
      <Field label="Notes" htmlFor="organization-notes" error={errors.notes?.message}>
        <textarea id="organization-notes" rows={3} className="input" {...register("notes")} />
      </Field>
    </FormDialog>
  );
}
