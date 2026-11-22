import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, fieldProps } from "../shared/Field";
import { applyServerErrors } from "../shared/forms";
import { useToast } from "../shared/Toast";
import { orNull, organizationSchema, type OrganizationValues } from "../shared/validation";
import { useOrganizations, useSaveOrganization, type Organization } from "./hooks";

type Props = {
  organization?: Organization;
  onSaved: (saved: Organization) => void;
  onCancel: () => void;
};

const FIELDS = ["name", "website", "industry", "notes"] as const;

export function OrganizationForm({ organization, onSaved, onCancel }: Props) {
  const toast = useToast();
  const save = useSaveOrganization();
  const all = useOrganizations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: organization?.name ?? "",
      website: organization?.website ?? "",
      industry: organization?.industry ?? "",
      notes: organization?.notes ?? "",
    },
  });

  // Industry is free text, with the ones already in use offered as suggestions.
  const industries = useMemo(
    () => [...new Set((all.data?.items ?? []).map((o) => o.industry).filter(Boolean) as string[])].sort(),
    [all.data],
  );

  const onSubmit = async (values: OrganizationValues) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync({
        id: organization?.id,
        body: {
          name: values.name.trim(),
          website: orNull(values.website),
          industry: orNull(values.industry),
          notes: orNull(values.notes),
        },
      });
      toast.success(organization ? `Saved ${saved.name}.` : `Added ${saved.name}.`);
      onSaved(saved);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError && (
        <div className="form-error" role="alert">
          {formError}
        </div>
      )}
      <Field id="org-name" label="Name" required error={errors.name?.message}>
        <input {...fieldProps("org-name", errors.name?.message)} {...register("name")} autoComplete="off" autoFocus />
      </Field>
      <Field id="org-website" label="Website" error={errors.website?.message} hint="For example acme.com">
        <input {...fieldProps("org-website", errors.website?.message)} {...register("website")} autoComplete="off" />
      </Field>
      <Field id="org-industry" label="Industry" error={errors.industry?.message}>
        <input
          {...fieldProps("org-industry", errors.industry?.message)}
          {...register("industry")}
          list="industry-options"
          autoComplete="off"
        />
        <datalist id="industry-options">
          {industries.map((industry) => (
            <option key={industry} value={industry} />
          ))}
        </datalist>
      </Field>
      <Field id="org-notes" label="Notes" error={errors.notes?.message}>
        <textarea {...fieldProps("org-notes", errors.notes?.message)} {...register("notes")} />
      </Field>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={isSubmitting}>
          {organization ? "Save organization" : "Add organization"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
