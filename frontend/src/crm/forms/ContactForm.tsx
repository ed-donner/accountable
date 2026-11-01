import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "../../components/Field";
import { FormDialog } from "../../components/FormDialog";
import { RecordPicker } from "../../components/RecordPicker";
import { EMAIL_MESSAGE, isEmail } from "../../lib/validate";
import { capitalize } from "../../lib/words";
import { useOrganizations, useSaveContact, type Contact, type ContactDetail, type Status } from "../queries";
import { link } from "./links";
import { OrganizationForm } from "./OrganizationForm";
import { showSaveError } from "./server-errors";

const STATUSES: Status[] = ["lead", "qualified", "customer"];

function contactSchema(record?: Contact) {
  return z.object({
    name: z.string().trim().min(1, "Enter a name"),
    organization_id: link(record !== undefined && record.organization_id === null, "Choose an organization"),
    email: z
      .string()
      .trim()
      .refine((value) => value === "" || isEmail(value), EMAIL_MESSAGE),
    phone: z.string().trim(),
    job_title: z.string().trim(),
    status: z.enum(["lead", "qualified", "customer"]),
  });
}

type Values = z.infer<ReturnType<typeof contactSchema>>;

type Props = {
  record?: Contact;
  defaultName?: string;
  defaultOrganizationId?: number | null;
  onClose: () => void;
  onSaved?: (saved: ContactDetail) => void;
};

export function ContactForm({ record, defaultName, defaultOrganizationId, onClose, onSaved }: Props) {
  const organizations = useOrganizations();
  const save = useSaveContact(record?.id);
  const [addingOrganization, setAddingOrganization] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(contactSchema(record)),
    defaultValues: {
      name: record?.name ?? defaultName ?? "",
      organization_id: record ? record.organization_id : (defaultOrganizationId ?? null),
      email: record?.email ?? "",
      phone: record?.phone ?? "",
      job_title: record?.job_title ?? "",
      status: record?.status ?? "lead",
    },
  });

  const organizationBlankAllowed = record !== undefined && record.organization_id === null;

  function submit(values: Values) {
    save.mutate(
      {
        name: values.name,
        organization_id: values.organization_id,
        email: values.email || null,
        phone: values.phone || null,
        job_title: values.job_title || null,
        status: values.status,
      },
      {
        onSuccess: (saved) => {
          toast.success("Contact saved.");
          onSaved?.(saved);
          onClose();
        },
        onError: (error) => showSaveError(error, setError),
      },
    );
  }

  return (
    <FormDialog
      title={record ? "Edit contact" : "Add contact"}
      submitLabel="Save contact"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <Field label="Name" htmlFor="contact-name" error={errors.name?.message}>
        <input id="contact-name" className="input" aria-invalid={!!errors.name} {...register("name")} />
      </Field>
      <Field label="Organization" htmlFor="contact-organization" error={errors.organization_id?.message}>
        <Controller
          control={control}
          name="organization_id"
          render={({ field }) => (
            <RecordPicker
              id="contact-organization"
              label="Organization"
              noun="organization"
              value={field.value}
              options={organizations.data ?? []}
              placeholder={organizationBlankAllowed ? "None" : "Choose an organization"}
              invalid={!!errors.organization_id}
              onChange={(id) => {
                field.onChange(id);
                clearErrors("organization_id");
              }}
              onAdd={setAddingOrganization}
            />
          )}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Email" htmlFor="contact-email" error={errors.email?.message}>
          <input id="contact-email" className="input" aria-invalid={!!errors.email} {...register("email")} />
        </Field>
        <Field label="Phone" htmlFor="contact-phone" error={errors.phone?.message}>
          <input id="contact-phone" className="input" {...register("phone")} />
        </Field>
        <Field label="Job title" htmlFor="contact-job-title" error={errors.job_title?.message}>
          <input id="contact-job-title" className="input" {...register("job_title")} />
        </Field>
        <Field label="Status" htmlFor="contact-status" error={errors.status?.message}>
          <select id="contact-status" className="input" {...register("status")}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {capitalize(status)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {addingOrganization !== null && (
        <OrganizationForm
          defaultName={addingOrganization}
          onClose={() => setAddingOrganization(null)}
          onSaved={(saved) => {
            setValue("organization_id", saved.id);
            clearErrors("organization_id");
          }}
        />
      )}
    </FormDialog>
  );
}
