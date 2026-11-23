import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormActions, FormError, fieldProps } from "../shared/Field";
import { applyServerErrors, errorMessages } from "../shared/forms";
import { useToast } from "../shared/Toast";
import { orNull, organizationSchema, type OrganizationValues } from "../shared/validation";
import { useOrganizations, useSaveOrganization, type Organization } from "./hooks";

type Props = {
  organization?: Organization;
  onSaved: (saved: Organization) => void;
  onCancel: () => void;
};

const FIELDS = ["name", "website", "industry", "notes"] as const;

function organizationDefaults(organization?: Organization): OrganizationValues {
  return {
    name: organization?.name ?? "",
    website: organization?.website ?? "",
    industry: organization?.industry ?? "",
    notes: organization?.notes ?? "",
  };
}

function organizationBody(values: OrganizationValues) {
  return {
    name: values.name.trim(),
    website: orNull(values.website),
    industry: orNull(values.industry),
    notes: orNull(values.notes),
  };
}

/** Industry is free text, with the ones already in use offered as suggestions. */
function useIndustries() {
  const all = useOrganizations();
  return useMemo(() => {
    const used = (all.data?.items ?? []).map((o) => o.industry).filter(Boolean) as string[];
    return [...new Set(used)].sort();
  }, [all.data]);
}

export function OrganizationForm({ organization, onSaved, onCancel }: Props) {
  const toast = useToast();
  const save = useSaveOrganization();
  const industries = useIndustries();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: organizationDefaults(organization),
  });
  const errorOf = errorMessages(errors);

  const onSubmit = async (values: OrganizationValues) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync({
        id: organization?.id,
        body: organizationBody(values),
      });
      toast.success(organization ? `Saved ${saved.name}.` : `Added ${saved.name}.`);
      onSaved(saved);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormError message={formError} />
      <Field id="org-name" label="Name" required error={errorOf("name")}>
        <input
          {...fieldProps("org-name", errorOf("name"))}
          {...register("name")}
          autoComplete="off"
        />
      </Field>
      <Field
        id="org-website"
        label="Website"
        error={errorOf("website")}
        hint="For example acme.com"
      >
        <input
          {...fieldProps("org-website", errorOf("website"))}
          {...register("website")}
          autoComplete="off"
        />
      </Field>
      <Field id="org-industry" label="Industry" error={errorOf("industry")}>
        <input
          {...fieldProps("org-industry", errorOf("industry"))}
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
      <Field id="org-notes" label="Notes" error={errorOf("notes")}>
        <textarea {...fieldProps("org-notes", errorOf("notes"))} {...register("notes")} />
      </Field>
      <FormActions
        submitLabel={organization ? "Save organization" : "Add organization"}
        submitting={isSubmitting}
        onCancel={onCancel}
      />
    </form>
  );
}
