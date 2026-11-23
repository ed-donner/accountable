import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FormActions, FormError, fieldProps } from "../shared/Field";
import { Loading } from "../shared/Loading";
import { applyServerErrors, errorMessages } from "../shared/forms";
import { STATUSES } from "../shared/stages";
import { useToast } from "../shared/Toast";
import { contactSchema, idOrNull, orNull, type ContactValues } from "../shared/validation";
import { useOrganizations } from "../organizations/hooks";
import { OrganizationSelect } from "../organizations/OrganizationSelect";
import { useSaveContact, type Contact } from "./hooks";

type Props = {
  contact?: Contact;
  /** Preset organization, when adding from an organization's page. */
  organizationId?: number;
  onSaved: (saved: Contact) => void;
  onCancel: () => void;
};

const FIELDS = ["name", "email", "phone", "job_title", "organization_id", "status"] as const;

function contactDefaults(contact?: Contact, organizationId?: number): ContactValues {
  return {
    name: contact?.name ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    job_title: contact?.job_title ?? "",
    organization_id: String(contact?.organization_id ?? organizationId ?? ""),
    status: contact?.status ?? "lead",
  };
}

function contactBody(values: ContactValues) {
  return {
    name: values.name.trim(),
    email: orNull(values.email),
    phone: orNull(values.phone),
    job_title: orNull(values.job_title),
    organization_id: idOrNull(values.organization_id),
    status: values.status,
  };
}

function ContactFormFields({ contact, organizationId, onSaved, onCancel }: Props) {
  const toast = useToast();
  const save = useSaveContact();
  const organizations = useOrganizations();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: contactDefaults(contact, organizationId),
  });
  const errorOf = errorMessages(errors);

  const onSubmit = async (values: ContactValues) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync({ id: contact?.id, body: contactBody(values) });
      toast.success(contact ? `Saved ${saved.name}.` : `Added ${saved.name}.`);
      onSaved(saved);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  };

  // After a Retry brings the choices in, show the preset one as chosen again.
  const orgCount = organizations.data?.items.length ?? 0;
  useEffect(() => {
    setValue("organization_id", getValues("organization_id"));
  }, [orgCount, getValues, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormError message={formError} />
      <Field id="contact-name" label="Name" required error={errorOf("name")}>
        <input
          {...fieldProps("contact-name", errorOf("name"))}
          {...register("name")}
          autoComplete="off"
        />
      </Field>
      <OrganizationSelect
        id="contact-organization"
        registration={register("organization_id")}
        error={errorOf("organization_id")}
        emptyLabel="No organization"
      />
      <Field id="contact-job-title" label="Job title" error={errorOf("job_title")}>
        <input
          {...fieldProps("contact-job-title", errorOf("job_title"))}
          {...register("job_title")}
          autoComplete="off"
        />
      </Field>
      <div className="row-2">
        <Field id="contact-email" label="Email" error={errorOf("email")}>
          <input
            type="email"
            {...fieldProps("contact-email", errorOf("email"))}
            {...register("email")}
            autoComplete="off"
          />
        </Field>
        <Field id="contact-phone" label="Phone" error={errorOf("phone")}>
          <input
            type="tel"
            {...fieldProps("contact-phone", errorOf("phone"))}
            {...register("phone")}
            autoComplete="off"
          />
        </Field>
      </div>
      <Field id="contact-status" label="Status" required error={errorOf("status")}>
        <select {...fieldProps("contact-status", errorOf("status"))} {...register("status")}>
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <FormActions
        submitLabel={contact ? "Save contact" : "Add contact"}
        submitting={isSubmitting}
        onCancel={onCancel}
      />
    </form>
  );
}

/**
 * Waits for the organizations, so a preset one shows as chosen. Only the first load
 * waits: a failed list goes back to "pending" when it's fetched again, and swapping
 * the form for Loading then would loop forever.
 */
export function ContactForm(props: Props) {
  const organizations = useOrganizations();
  const [loaded, setLoaded] = useState(false);
  if (!loaded && !organizations.isPending) setLoaded(true);
  if (!loaded && organizations.isPending) return <Loading />;
  return <ContactFormFields {...props} />;
}
