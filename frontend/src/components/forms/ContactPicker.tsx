import { useContacts } from "@/api/contacts";
import { Picker } from "./Picker";

type Props = {
  id: string;
  /** Only this organization's contacts are listed (spec 1.5). */
  organizationId: number | null;
  value: number | null;
  onChange: (value: number | null) => void;
  invalid?: boolean;
  describedBy?: string;
};

export function ContactPicker({ id, organizationId, value, onChange, invalid, describedBy }: Props) {
  const contacts = useContacts();
  const options = (contacts.data ?? [])
    .filter((contact) => organizationId !== null && contact.organization?.id === organizationId)
    .map((contact) => ({ id: contact.id, name: contact.name, hint: contact.job_title }));
  return (
    <Picker
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      placeholder={organizationId === null ? "Choose the organization first" : "Choose a contact"}
      searchPlaceholder="Search contacts"
      emptyText={organizationId === null ? "Choose the organization first." : "No contacts at this organization."}
      clearLabel="No main contact"
      disabled={organizationId === null}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
