import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { html } from "htm/preact";
import { createContext } from "preact";
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

  it("runs effects only when their dependencies change", () => {
    const events = [];
    let mountEffects = 0;
    const Component = hookless(({ effect, getProps }) => {
      effect(() => {
        mountEffects += 1;
      });
      effect(
        () => events.push(getProps().count),
        () => [getProps().count],
      );
      return { render: () => html`<div>${String(getProps().count)}</div>` };
    });
    const { rerender } = render(html`<${Component} count=${1} options=${["a", "b"]} />`);

    expect(events).toEqual([1]);
    rerender(html`<${Component} count=${1} options=${["a", "b"]} />`);
    rerender(html`<${Component} count=${2} options=${["a", "b"]} />`);

    expect(events).toEqual([1, 2]);
    expect(mountEffects).toBe(1);
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

  it("rerenders when an auto event prop is added or removed", () => {
    let renderCalls = 0;
    const calls = [];
    const Component = hookless(({ getProps }) => ({
      render() {
        renderCalls += 1;
        return html`<button onClick=${getProps().onClick}>Click</button>`;
      },
    }));
    const { getByRole, rerender } = render(html`<${Component} />`);

    rerender(html`<${Component} onClick=${() => calls.push("click")} />`);
    fireEvent.click(getByRole("button", { name: "Click" }));
    rerender(html`<${Component} />`);
    fireEvent.click(getByRole("button", { name: "Click" }));

    expect(renderCalls).toBe(3);
    expect(calls).toEqual(["click"]);
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

  it("uses current state in dependencies and effects", () => {
    const values = [];
    const Component = hookless(({ effect }) => {
      const [getCount, setCount] = createState(0);
      effect(
        () => values.push(getCount()),
        () => [getCount()],
      );
      return {
        render: () => html`<button onClick=${() => setCount((value) => value + 1)}>Count</button>`,
      };
    });
    const { getByRole } = render(html`<${Component} />`);

    fireEvent.click(getByRole("button", { name: "Count" }));

    expect(values).toEqual([0, 1]);
  });

  it("runs layout effects before ordinary effects", () => {
    const events = [];
    const Component = hookless(({ effect, layoutEffect }) => {
      effect(() => events.push("effect"));
      layoutEffect(() => events.push("layoutEffect"));
      return { render: () => html`<div>ready</div>` };
    });

    render(html`<${Component} />`);

    expect(events).toEqual(["layoutEffect", "effect"]);
  });

  it("runs effect cleanups before reruns and on unmount", () => {
    let mounted = 0;
    let cleaned = 0;
    let mountOnlyRuns = 0;
    const Component = hookless(({ effect, getProps }) => {
      effect(
        () => {
          mounted += 1;
          return () => {
            cleaned += 1;
          };
        },
        () => [getProps().value],
      );
      effect(
        () => {
          mountOnlyRuns += 1;
        },
        () => [],
      );
      return { render: () => html`<div>ready</div>` };
    });
    const view = render(html`<${Component} value=${1} />`);

    view.rerender(html`<${Component} value=${2} />`);
    expect({ cleaned, mounted }).toEqual({ cleaned: 1, mounted: 2 });
    expect(mountOnlyRuns).toBe(1);

    view.unmount();

    expect(cleaned).toBe(2);
  });

  it("rerenders for context changes and exposes the latest value", () => {
    const Theme = createContext("light");
    const effectValues = [];
    let getTheme;
    let renderCalls = 0;
    const Component = hookless(({ effect, getContext }) => {
      getTheme = getContext(Theme);
      effect(
        () => effectValues.push(getTheme()),
        () => [getTheme()],
      );
      return {
        render() {
          renderCalls += 1;
          return html`<div>${getTheme()}</div>`;
        },
      };
    });
    const { container, rerender } = render(
      html`<${Theme.Provider} value="light"><${Component} /><//>`,
    );

    rerender(html`<${Theme.Provider} value="dark"><${Component} /><//>`);

    expect(container.textContent).toBe("dark");
    expect(getTheme()).toBe("dark");
    expect(effectValues).toEqual(["light", "dark"]);
    expect(renderCalls).toBe(2);
  });
});
