import { describe, it, expect } from "vitest";
import "../../src/components/rdf-display-wrapper.js";

describe("<rdf-display-wrapper>", () => {
  it("is registered and wires adapter/display attributes", async () => {
    const el = document.createElement("rdf-display-wrapper");
    el.setAttribute("src", "https://example.org/data.ttl");
    el.setAttribute("shape-src", "https://example.org/shapes.ttl");
    el.setAttribute("template-id", "my-template");
    document.body.appendChild(el);

    const display = el.shadowRoot.querySelector("rdf-display");
    const adapter = el.shadowRoot.querySelector("rdf-adapter");
    expect(display.getAttribute("template-id")).toBe("my-template");
    expect(adapter.getAttribute("src")).toBe("https://example.org/data.ttl");
    expect(adapter.getAttribute("shape-src")).toBe("https://example.org/shapes.ttl");
    el.remove();
  });

  it("forwards externally dispatched rdf-loaded events to internal display", async () => {
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
    expect(display.lensObject).toBeTruthy();
    expect(Array.isArray(display.triples)).toBe(true);
    el.remove();
  });
});
