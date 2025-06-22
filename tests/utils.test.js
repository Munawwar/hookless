import { html } from "htm/preact";
import { describe, expect, it } from "vitest";
import { isEqual } from "../lib/utils.js";

describe("isEqual", () => {
  it("deeply compares plain objects and arrays", () => {
    expect(isEqual({ a: 1, nested: { b: [1, 2, 3] } }, { a: 1, nested: { b: [1, 2, 3] } })).toBe(
      true,
    );
    expect(isEqual({ a: 1, nested: { b: [1, 2, 3] } }, { a: 1, nested: { b: [1, 2, 4] } })).toBe(
      false,
    );
  });

  it("handles circular references", () => {
    const value1 = { name: "one" };
    const value2 = { name: "one" };
    value1.self = value1;
    value2.self = value2;

    expect(isEqual(value1, value2)).toBe(true);
  });

  it("compares VNodes by reference", () => {
    const vnode = html`<div role="note">hi</div>`;

    expect(isEqual(vnode, vnode)).toBe(true);
    expect(isEqual(vnode, html`<div role="note">hi</div>`)).toBe(false);
  });

  it("compares non-plain objects by reference", () => {
    class Item {
      constructor(value) {
        this.value = value;
      }
    }

    expect(isEqual(new Map([["a", 1]]), new Map([["a", 1]]))).toBe(false);
    expect(isEqual(new Set(["a"]), new Set(["a"]))).toBe(false);
    expect(isEqual(new Item(1), new Item(1))).toBe(false);
    expect(isEqual(document.createElement("div"), document.createElement("div"))).toBe(false);
  });
});
