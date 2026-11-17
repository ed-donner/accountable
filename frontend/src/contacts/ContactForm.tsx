import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, fieldProps } from "../shared/Field";
import { Loading } from "../shared/Loading";
import { applyServerErrors } from "../shared/forms";
import { STATUSES } from "../shared/stages";
import { useToast } from "../shared/Toast";
import { contactSchema, idOrNull, orNull, type ContactValues } from "../shared/validation";
import { useOrganizations } from "../organizations/hooks";
import { useSaveContact, type Contact } from "./hooks";

type Props = {
  contact?: Contact;
  /** Preset organization, when adding from an organization's page. */
  organizationId?: number;
  onSaved: (saved: Contact) => void;
  onCancel: () => void;
};

const FIELDS = ["name", "email", "phone", "job_title", "organization_id", "status"] as const;

function ContactFormFields({ contact, organizationId, onSaved, onCancel }: Props) {
  const toast = useToast();
  const save = useSaveContact();
  const organizations = useOrganizations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      job_title: contact?.job_title ?? "",
      organization_id: String(contact?.organization_id ?? organizationId ?? ""),
      status: contact?.status ?? "lead",
    },
  });

  const onSubmit = async (values: ContactValues) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync({
        id: contact?.id,
        body: {
          name: values.name.trim(),
          email: orNull(values.email),
          phone: orNull(values.phone),
          job_title: orNull(values.job_title),
          organization_id: idOrNull(values.organization_id),
          status: values.status,
        },
      });
      toast.success(contact ? `Saved ${saved.name}.` : `Added ${saved.name}.`);
      onSaved(saved);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  };

  const orgs = [...(organizations.data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {formError && (
        <div className="form-error" role="alert">
          {formError}
        </div>
      )}
      <Field id="contact-name" label="Name" required error={errors.name?.message}>
        <input {...fieldProps("contact-name", errors.name?.message)} {...register("name")} autoComplete="off" autoFocus />
      </Field>
      <Field id="contact-organization" label="Organization" error={errors.organization_id?.message}>
        <select {...fieldProps("contact-organization", errors.organization_id?.message)} {...register("organization_id")}>
          <option value="">No organization</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="contact-job-title" label="Job title" error={errors.job_title?.message}>
        <input {...fieldProps("contact-job-title", errors.job_title?.message)} {...register("job_title")} autoComplete="off" />
      </Field>
      <div className="row-2">
        <Field id="contact-email" label="Email" error={errors.email?.message}>
          <input type="email" {...fieldProps("contact-email", errors.email?.message)} {...register("email")} autoComplete="off" />
        </Field>
        <Field id="contact-phone" label="Phone" error={errors.phone?.message}>
          <input type="tel" {...fieldProps("contact-phone", errors.phone?.message)} {...register("phone")} autoComplete="off" />
        </Field>
      </div>
      <Field id="contact-status" label="Status" required error={errors.status?.message}>
        <select {...fieldProps("contact-status", errors.status?.message)} {...register("status")}>
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={isSubmitting}>
          {contact ? "Save contact" : "Add contact"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Waits for the lists its selects offer, so a preset organization or contact shows as chosen. */
export function ContactForm(props: Props) {
  const organizations = useOrganizations();

  if (organizations.isPending) return <Loading />;
  return <ContactFormFields {...props} />;
}
