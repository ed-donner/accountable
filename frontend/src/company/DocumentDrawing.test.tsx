import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import cases from "../../../shared/document-layout-cases.json";
import { DocumentDrawing } from "./DocumentDrawing";
import type { DocumentValues } from "./layout";

const SHORT = cases.cases[0].document as DocumentValues;
const LOGO = "data:image/png;base64,iVBORw0KGgo=";

function drawn(values: DocumentValues, logoUrl: string | null = LOGO) {
  const { container } = render(<DocumentDrawing values={values} logoUrl={logoUrl} />);
  return container;
}

function textIn(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("text")].filter((element) => element.textContent === text);
}

describe("a quote or an invoice drawn", () => {
  it.each(["classic", "banner", "ledger"] as const)("draws %s in its accent color with the logo", (design) => {
    const container = drawn({ ...SHORT, design, accent: "#107FA4" });
    const accented = [...container.querySelectorAll("text, rect")].filter(
      (element) => element.getAttribute("fill") === "#107FA4",
    );
    expect(accented.length).toBeGreaterThan(0);
    const [logo] = container.querySelectorAll("image");
    expect(logo.getAttribute("href")).toBe(LOGO);
    expect(Number(logo.getAttribute("width"))).toBeLessThanOrEqual(144);
  });

  it("leaves the logo out when there's none", () => {
    expect(drawn({ ...SHORT, logo: null }, null).querySelectorAll("image")).toHaveLength(0);
  });

  it.each([
    ["paid", "PAID", "#047A5B"],
    ["overdue", "OVERDUE", "#D23E62"],
    ["void", "VOID", "#5B6970"],
    ["draft", "DRAFT", "#5B6970"],
  ] as const)("marks a %s invoice %s in its own color", (mark, word, color) => {
    const container = drawn({ ...SHORT, mark });
    const [shown] = textIn(container, word);
    expect(shown.getAttribute("fill")).toBe(color);
  });

  it("lays VOID large and faint across the page of a void invoice, hidden from screen readers", () => {
    const [, across] = textIn(drawn({ ...SHORT, mark: "void" }), "VOID");
    expect(across.getAttribute("transform")).toBe("rotate(-30 306 448)");
    expect(across.getAttribute("fill-opacity")).toBe("0.14");
    expect(across.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows Draft where the number goes on a draft", () => {
    const container = drawn({ ...SHORT, number: null, mark: "draft" });
    expect(textIn(container, "Draft")).toHaveLength(1);
    expect(textIn(container, "Draft, page 1 of 1")).toHaveLength(1);
  });

  it("shows markup typed into the Bill to as the text it is, with no element made from it", () => {
    const container = drawn({ ...SHORT, recipient: "<b>Acme</b> & Co\n<script>alert(1)</script>" });
    expect(textIn(container, "<b>Acme</b> & Co")).toHaveLength(1);
    expect(container.querySelector("b, script")).toBeNull();
  });

  it("keeps a run of spaces, with no kerning or ligatures, as the PDF draws it", () => {
    const [line] = textIn(drawn({ ...SHORT, recipient: "Harbor   &   Pine" }), "Harbor   &   Pine");
    expect(line.getAttribute("xml:space")).toBe("preserve");
    expect(line.style.fontKerning).toBe("none");
  });

  it("draws every page, one under another, each saying which it is", () => {
    const hundred = cases.cases.find((item) => item.name === "100 lines over several pages")!
      .document as DocumentValues;
    render(<DocumentDrawing values={hundred} logoUrl={null} />);
    expect(screen.getAllByRole("img").map((page) => page.getAttribute("aria-label"))).toEqual(
      [1, 2, 3, 4, 5].map((number) => `Invoice preview, page ${number} of 5`),
    );
  });

  it("names a quote's pages as a quote's", () => {
    render(<DocumentDrawing values={{ ...SHORT, kind: "quote" }} logoUrl={null} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Quote preview, page 1 of 1");
  });
});
