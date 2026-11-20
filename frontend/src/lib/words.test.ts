import { describe, expect, it } from "vitest";
import { activityDelete, contactDelete, dealDelete, messages, organizationBlocked, organizationDelete, pipelineLine } from "./words";

describe("delete dialog wording", () => {
  it("DEL-2: an organization without deals", () => {
    expect(organizationDelete("Bluefin Logistics", 3)).toEqual({
      title: "Delete Bluefin Logistics?",
      lines: ["Its 3 contacts will stay, with no organization."],
    });
    expect(organizationDelete("Bluefin Logistics", 1).lines).toEqual(["Its 1 contact will stay, with no organization."]);
    expect(organizationDelete("Bluefin Logistics", 0).lines).toEqual([]);
  });

  it("DEL-3: a blocked organization", () => {
    expect(organizationBlocked("Bluefin Logistics").lines).toEqual([
      "Bluefin Logistics can't be deleted while it has deals. Move these deals to another organization or delete them first:",
    ]);
  });

  it("DEL-4: a contact", () => {
    expect(contactDelete("Sarah Chen", 6, ["Website redesign", "Q1 SEO retainer"])).toEqual({
      title: "Delete Sarah Chen?",
      lines: [
        "Sarah Chen's 6 activities will be deleted.",
        "These deals will stay, with no main contact: Website redesign, Q1 SEO retainer.",
      ],
    });
    expect(contactDelete("Sarah Chen", 1, ["Website redesign"]).lines).toEqual([
      "Sarah Chen's 1 activity will be deleted.",
      "This deal will stay, with no main contact: Website redesign.",
    ]);
    expect(contactDelete("Sarah Chen", 0, []).lines).toEqual([]);
  });

  it("DEL-5: a deal", () => {
    expect(dealDelete("Website redesign", 5, 2)).toEqual({
      title: "Delete Website redesign?",
      lines: ["Its 5 activities, including its stage changes, will be deleted."],
    });
    expect(dealDelete("Website redesign", 3, 1).lines).toEqual([
      "Its 3 activities, including its stage change, will be deleted.",
    ]);
    expect(dealDelete("Website redesign", 4, 0).lines).toEqual(["Its 4 activities will be deleted."]);
    expect(dealDelete("Website redesign", 1, 0).lines).toEqual(["Its 1 activity will be deleted."]);
    expect(dealDelete("Website redesign", 0, 0).lines).toEqual([]);
  });

  it("DEL-6: an activity, on its local day", () => {
    expect(activityDelete("call", "2026-11-12T18:00:00Z").title).toBe("Delete this call from Nov 12, 2026?");
    // 02:00 UTC on Nov 13 is still Nov 12 in Los Angeles.
    expect(activityDelete("email", "2026-11-13T02:00:00Z").title).toBe("Delete this email from Nov 12, 2026?");
  });
});

describe("short messages", () => {
  it("are plain and short", () => {
    expect(messages.added("Contact")).toBe("Contact added");
    expect(messages.saved).toBe("Changes saved");
    expect(messages.moved("negotiation")).toBe("Deal moved to Negotiation");
    expect(messages.moveFailed).toBe("Couldn't move the deal. Try again.");
    expect(messages.saveFailed).toBe("Couldn't save. Try again.");
    expect(messages.deleted("Deal")).toBe("Deal deleted");
  });
});

describe("pipelineLine", () => {
  it("counts the open deals and the late ones (PIPE-3)", () => {
    expect(pipelineLine(19, 3)).toBe("19 open deals, 3 of them late");
    expect(pipelineLine(19, 0)).toBe("19 open deals");
    expect(pipelineLine(1, 0)).toBe("1 open deal");
    expect(pipelineLine(1, 1)).toBe("1 open deal, and it's late");
    expect(pipelineLine(0, 0)).toBe("0 open deals");
  });
});
