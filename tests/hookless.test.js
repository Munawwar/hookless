import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { html } from "htm/preact";
import { afterEach, describe, expect, it } from "vitest";
import { createState, hookless } from "../lib/hookless.js";

afterEach(cleanup);

describe("hookless", () => {
  it("reuses the previous vnode when props are deeply equal", () => {
    let factoryCalls = 0;
    let renderCalls = 0;
    const Component = hookless(({ getProps }) => {
      factoryCalls += 1;
      return {
        render() {
          renderCalls += 1;
          return html`<div>${getProps().label}</div>`;
        },
      };
    });
    const { rerender } = render(html`<${Component} label="one" data=${{ count: 1 }} />`);

    rerender(html`<${Component} label="one" data=${{ count: 1 }} />`);

    expect(factoryCalls).toBe(1);
    expect(renderCalls).toBe(1);
  });

  it("reuses unchanged prop references when another prop changes", () => {
    const seenOptions = [];
    const Component = hookless(({ getProps }) => ({
      render() {
        seenOptions.push(getProps().options);
        return html`<div>${getProps().label}</div>`;
      },
    }));
    const { rerender } = render(html`<${Component} label="one" options=${["a", "b"]} />`);

    rerender(html`<${Component} label="two" options=${["a", "b"]} />`);

    expect(seenOptions).toHaveLength(2);
    expect(seenOptions[1]).toBe(seenOptions[0]);
  });

  it("reports only meaningful prop changes to onProps", () => {
    const events = [];
    let firstOptions = null;
    const Component = hookless(({ getProps, onProps }) => {
      onProps((changedProps, oldProps) => {
        events.push({ changedProps, oldProps });
      });
      return {
        render() {
          firstOptions ??= getProps().options;
          return html`<div>${String(getProps().count)}</div>`;
        },
      };
    });
    const { rerender } = render(html`<${Component} count=${1} options=${["a", "b"]} />`);

    rerender(html`<${Component} count=${2} options=${["a", "b"]} />`);

    expect(events).toHaveLength(2);
    expect(events[1].changedProps).toEqual(["count"]);
    expect(events[1].oldProps.count).toBe(1);
    expect(events[1].oldProps.options).toBe(firstOptions);
  });

  it("keeps auto event props stable while calling the latest handler", () => {
    let renderCalls = 0;
    const calls = [];
    const Component = hookless(({ getProps }) => ({
      render() {
        renderCalls += 1;
        return html`<button onClick=${getProps().onClick}>Click</button>`;
      },
    }));
    const { getByRole, rerender } = render(
      html`<${Component} onClick=${() => calls.push("first")} />`,
    );

    fireEvent.click(getByRole("button", { name: "Click" }));
    rerender(html`<${Component} onClick=${() => calls.push("second")} />`);
    fireEvent.click(getByRole("button", { name: "Click" }));

    expect(renderCalls).toBe(1);
    expect(calls).toEqual(["first", "second"]);
  });

  it("supports custom auto event props through include", () => {
    let renderCalls = 0;
    const calls = [];
    const Component = hookless(
      ({ getProps }) => ({
        render() {
          renderCalls += 1;
          return html`<button onClick=${getProps().handleClick}>Custom</button>`;
        },
      }),
      { autoEffectEvent: { include: ["handleClick"] } },
    );
    const { getByRole, rerender } = render(
      html`<${Component} handleClick=${() => calls.push("first")} />`,
    );

    rerender(html`<${Component} handleClick=${() => calls.push("second")} />`);
    fireEvent.click(getByRole("button", { name: "Custom" }));

    expect(renderCalls).toBe(1);
    expect(calls).toEqual(["second"]);
  });

  it("updates local state and lets false suppress the rerender", async () => {
    let renderCalls = 0;
    let callbackCalls = 0;
    const Component = hookless(({ update }) => {
      const [getCount, setCount] = createState(0);
      return {
        render() {
          renderCalls += 1;
          return html`
            <div>
              <output aria-label="count">${String(getCount())}</output>
              <button onClick=${() => setCount((value) => value + 1)}>Increment</button>
              <button onClick=${() => setCount((value) => value + 1, false)}>Silent</button>
              <button
                onClick=${() =>
                  update(() => {
                    callbackCalls += 1;
                  })}
              >
                Flush
              </button>
            </div>
          `;
        },
      };
    });
    const { getByRole } = render(html`<${Component} />`);

    fireEvent.click(getByRole("button", { name: "Increment" }));
    expect(getByRole("status", { name: "count" }).textContent).toBe("1");
    expect(renderCalls).toBe(2);

    fireEvent.click(getByRole("button", { name: "Silent" }));
    expect(getByRole("status", { name: "count" }).textContent).toBe("1");
    expect(renderCalls).toBe(2);

    fireEvent.click(getByRole("button", { name: "Flush" }));
    await waitFor(() => {
      expect(getByRole("status", { name: "count" }).textContent).toBe("2");
      expect(callbackCalls).toBe(1);
    });
    expect(renderCalls).toBe(3);
  });

  it("does not queue an extra rerender when update is called during render", () => {
    let renderCalls = 0;
    const Component = hookless(({ getProps, onProps, update }) => {
      onProps((changedProps) => {
        if (changedProps.includes("value")) update();
      });
      return {
        render() {
          renderCalls += 1;
          return html`<div>${String(getProps().value)}</div>`;
        },
      };
    });
    const { rerender } = render(html`<${Component} value=${1} />`);

    rerender(html`<${Component} value=${2} />`);

    expect(renderCalls).toBe(2);
  });

  it("does not queue an extra rerender when createState updates during render", () => {
    let renderCalls = 0;
    const Component = hookless(({ getProps, onProps }) => {
      const [getSelection, setSelection] = createState(getProps().options[0]);
      onProps((changedProps) => {
        if (changedProps.includes("options")) setSelection(getProps().options[0]);
      });
      return {
        render() {
          renderCalls += 1;
          return html`<div>${getSelection()}</div>`;
        },
      };
    });
    const { rerender, container } = render(html`<${Component} options=${["red", "blue"]} />`);

    rerender(html`<${Component} options=${["green", "yellow"]} />`);

    expect(container.textContent).toBe("green");
    expect(renderCalls).toBe(2);
  });

  it("runs mount cleanups on unmount", () => {
    let mounted = 0;
    let cleaned = 0;
    const Component = hookless(({ onMount }) => {
      onMount(() => {
        mounted += 1;
        return () => {
          cleaned += 1;
        };
      });
      return { render: () => html`<div>ready</div>` };
    });
    const view = render(html`<${Component} />`);

    view.unmount();

    expect(mounted).toBe(1);
    expect(cleaned).toBe(1);
  });
});
