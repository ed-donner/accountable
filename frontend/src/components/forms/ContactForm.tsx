import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useContact, useSaveContact } from "@/api/contacts";
import type { Contact, ContactSaved } from "@/api/types";
import { Input } from "@/components/ui/input";
import { STATUSES, STATUS_NAMES, type Status } from "@/lib/rules";
import { messages } from "@/lib/words";
import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Field, FormDialog, fieldAria, showSaveError } from "./FormDialog";
import { OrganizationPicker } from "./OrganizationPicker";
import { contactSchema, orNull, type ContactValues } from "./schemas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The contact to edit, or none to add one. */
  contact?: Contact;
  /** Fills in the organization, as from an organization's page (ORG-3). */
  defaultOrganizationId?: number;
  onSaved?: (saved: ContactSaved) => void;
};

const FIELDS = ["name", "email", "phone", "job_title", "organization_id", "status"] as const;

function valuesOf(contact?: Contact, defaultOrganizationId?: number): ContactValues {
  return {
    name: contact?.name ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    job_title: contact?.job_title ?? "",
    organization_id: contact ? (contact.organization?.id ?? null) : (defaultOrganizationId ?? null),
    // A new contact starts as Lead (spec 1.4).
    status: contact?.status ?? "lead",
  };
}

export function ContactForm({ open, onOpenChange, contact, defaultOrganizationId, onSaved }: Props) {
  const save = useSaveContact();
  // The deals where they're the main contact, for the CON-5 notice.
  const detail = useContact(contact?.id ?? Number.NaN);

  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: valuesOf(contact, defaultOrganizationId),
    mode: "onTouched",
  });
  const { register, handleSubmit, reset, setError, control, formState } = form;
  const errors = formState.errors;
  const organizationId = useWatch({ control, name: "organization_id" });

  useEffect(() => {
    if (open) reset(valuesOf(contact, defaultOrganizationId));
  }, [open, contact, defaultOrganizationId, reset]);

  const oldOrganizationId = contact?.organization?.id ?? null;
  const losing =
    contact && oldOrganizationId !== null && organizationId !== oldOrganizationId
      ? (detail.data?.deals ?? []).filter((deal) => deal.organization.id === oldOrganizationId)
      : [];

  const onSubmit = handleSubmit((values) => {
    const input = {
      name: values.name.trim(),
      email: orNull(values.email),
      phone: orNull(values.phone),
      job_title: orNull(values.job_title),
      organization_id: values.organization_id,
      status: values.status as Status,
    };
    save.mutate(
      { id: contact?.id, input },
      {
        onSuccess: (saved) => {
          toast.success(contact ? messages.saved : messages.added("Contact"));
          onOpenChange(false);
          onSaved?.(saved);
        },
        onError: (error) => showSaveError(error, setError, FIELDS),
      },
    );
  });

  const notice =
    losing.length > 0 ? (
      <div role="status" className="rounded-lg bg-marigold-tint px-4 py-3 text-[13px] leading-5 text-ink">
        <p className="font-medium">
          {contact!.name} will stop being the main contact on {losing.length === 1 ? "this deal" : "these deals"}:
        </p>
        <ul className="mt-1 list-disc pl-5">
          {losing.map((deal) => (
            <li key={deal.id}>{deal.name}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? `Edit ${contact.name}` : "Add contact"}
      submitLabel={contact ? "Save changes" : "Add contact"}
      pending={save.isPending}
      onSubmit={onSubmit}
      notice={notice}
    >
      <Field id="contact-name" label="Name" required error={errors.name?.message}>
        <Input {...fieldAria("contact-name", errors.name?.message)} autoComplete="off" {...register("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="contact-email" label="Email" error={errors.email?.message}>
          <Input {...fieldAria("contact-email", errors.email?.message)} type="email" autoComplete="off" {...register("email")} />
        </Field>
        <Field id="contact-phone" label="Phone" error={errors.phone?.message}>
          <Input {...fieldAria("contact-phone", errors.phone?.message)} type="tel" autoComplete="off" {...register("phone")} />
        </Field>
      </div>
      <Field id="contact-job-title" label="Job title" error={errors.job_title?.message}>
        <Input {...fieldAria("contact-job-title", errors.job_title?.message)} autoComplete="off" {...register("job_title")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="contact-organization" label="Organization" error={errors.organization_id?.message}>
          <Controller
            control={control}
            name="organization_id"
            render={({ field }) => (
              <OrganizationPicker
                id="contact-organization"
                value={field.value}
                onChange={field.onChange}
                allowNone
                invalid={!!errors.organization_id}
              />
            )}
          />
        </Field>
        <Field id="contact-status" label="Status" required error={errors.status?.message}>
          <select
            {...fieldAria("contact-status", errors.status?.message)}
            className={cn(fieldClasses, "h-10")}
            {...register("status")}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_NAMES[status]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </FormDialog>
  );
}
