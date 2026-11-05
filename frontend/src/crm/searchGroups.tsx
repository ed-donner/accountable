import type { SearchGroup } from "../components/Search";
import type { Stage } from "./queries";
import { StageChip } from "./StageChip";

type OrganizationResult = { id: number; name: string; industry: string | null };
type ContactResult = { id: number; name: string; organization_name: string | null };
type DealResult = { id: number; name: string; stage: Stage; organization_name: string | null };

const organizations: SearchGroup<OrganizationResult> = {
  kind: "organizations",
  heading: "Organizations",
  address: (id) => `/organizations/${id}`,
  detail: (result) => result.industry,
};

const contacts: SearchGroup<ContactResult> = {
  kind: "contacts",
  heading: "Contacts",
  address: (id) => `/contacts/${id}`,
  detail: (result) => result.organization_name,
};

const deals: SearchGroup<DealResult> = {
  kind: "deals",
  heading: "Deals",
  address: (id) => `/deals/${id}`,
  detail: (result) => result.organization_name,
  chip: (result) => <StageChip stage={result.stage} />,
};

/** What the top bar's search shows of the CRM's records (K4, K5). */
export const crmSearchGroups: SearchGroup[] = [organizations, contacts, deals];
