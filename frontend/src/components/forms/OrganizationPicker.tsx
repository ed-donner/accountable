import { useOrganizations } from "@/api/organizations";
import { Picker } from "./Picker";

type Props = {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  allowNone?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

export function OrganizationPicker({ id, value, onChange, allowNone, invalid, describedBy }: Props) {
  const organizations = useOrganizations();
  const options = (organizations.data ?? []).map((org) => ({ id: org.id, name: org.name, hint: org.industry }));
  return (
    <Picker
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Choose an organization"
      searchPlaceholder="Search organizations"
      emptyText="No organizations match."
      clearLabel={allowNone ? "No organization" : undefined}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
