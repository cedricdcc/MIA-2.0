import { describe, it, expect } from "vitest";
import "../../src/components/rdf-display-wrapper.js";

describe("<rdf-display-wrapper>", () => {
  it("is registered and forwards lens rows as display triples", async () => {
    const el = document.createElement("rdf-display-wrapper");
    document.body.appendChild(el);

    el.dispatchEvent(
      new CustomEvent("rdf-loaded", {
        detail: {
          lensObject: {
            Dataset: [{ title: "Demo title", id: "https://example.org/dataset/1" }],
          },
          triples: [],
        },
        bubbles: true,
        composed: true,
      }),
    );

    const display = el.shadowRoot.querySelector("rdf-display");
    await display.updateComplete;
    expect(display.triples.length).toBeGreaterThan(0);
    expect(display.triples.some((t) => t.object === "Demo title")).toBe(true);
    el.remove();
  });
});
