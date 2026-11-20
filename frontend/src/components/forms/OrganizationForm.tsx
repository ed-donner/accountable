import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useOrganizations, useSaveOrganization } from "@/api/organizations";
import type { OrganizationDetail, OrganizationRow } from "@/api/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { messages } from "@/lib/words";
import { Field, FormDialog, fieldAria, showSaveError } from "./FormDialog";
import { organizationSchema, orNull, type OrganizationValues } from "./schemas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The organization to edit, or none to add one. */
  organization?: OrganizationRow;
  onSaved?: (organization: OrganizationDetail) => void;
};

const FIELDS = ["name", "website", "industry", "notes"] as const;

function valuesOf(organization?: OrganizationRow): OrganizationValues {
  return {
    name: organization?.name ?? "",
    website: organization?.website ?? "",
    industry: organization?.industry ?? "",
    notes: organization?.notes ?? "",
  };
}

export function OrganizationForm({ open, onOpenChange, organization, onSaved }: Props) {
  const organizations = useOrganizations();
  const save = useSaveOrganization();
  const existing = useMemo(() => organizations.data ?? [], [organizations.data]);
  const schema = useMemo(() => organizationSchema(existing, organization?.id), [existing, organization?.id]);
  const industries = useMemo(
    () => [...new Set(existing.map((org) => org.industry).filter((value): value is string => !!value))].sort(),
    [existing],
  );

  const form = useForm<OrganizationValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(organization),
    mode: "onChange",
  });
  const { register, handleSubmit, reset, setError, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (open) reset(valuesOf(organization));
  }, [open, organization, reset]);

  const onSubmit = handleSubmit((values) => {
    const input = {
      name: values.name.trim(),
      website: orNull(values.website),
      industry: orNull(values.industry),
      notes: orNull(values.notes),
    };
    save.mutate(
      { id: organization?.id, input },
      {
        onSuccess: (saved) => {
          toast.success(organization ? messages.saved : messages.added("Organization"));
          onOpenChange(false);
          onSaved?.(saved);
        },
        onError: (error) => showSaveError(error, setError, FIELDS),
      },
    );
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={organization ? `Edit ${organization.name}` : "Add organization"}
      submitLabel={organization ? "Save changes" : "Add organization"}
      pending={save.isPending}
      onSubmit={onSubmit}
    >
      <Field id="org-name" label="Name" required error={errors.name?.message}>
        <Input {...fieldAria("org-name", errors.name?.message)} autoComplete="off" {...register("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="org-industry" label="Industry" error={errors.industry?.message}>
          <Input
            {...fieldAria("org-industry", errors.industry?.message)}
            list="org-industries"
            autoComplete="off"
            {...register("industry")}
          />
          <datalist id="org-industries">
            {industries.map((industry) => (
              <option key={industry} value={industry} />
            ))}
          </datalist>
        </Field>
        <Field id="org-website" label="Website" error={errors.website?.message}>
          <Input
            {...fieldAria("org-website", errors.website?.message)}
            placeholder="bluefin.example"
            autoComplete="off"
            {...register("website")}
          />
        </Field>
      </div>
      <Field id="org-notes" label="Notes" error={errors.notes?.message}>
        <Textarea {...fieldAria("org-notes", errors.notes?.message)} rows={4} {...register("notes")} />
      </Field>
    </FormDialog>
  );
}
