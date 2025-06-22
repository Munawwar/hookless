import htm from "htm";
import { createElement, render } from "preact";
import { useEffect, useState } from "preact/hooks";
import hljs from "https://unpkg.com/@highlightjs/cdn-assets@11.11.1/es/core.min.js";
import javascript from "https://unpkg.com/@highlightjs/cdn-assets@11.11.1/es/languages/javascript.min.js";
import { createRef, createState, hookless } from "../lib/hookless.js";

const html = htm.bind(createElement);

const palettes = [
  ["Coral", "Amber", "Olive"],
  ["Ocean", "Teal", "Cyan"],
  ["Plum", "Rose", "Pear"],
];

const demoSource = `import { hookless, createRef, createState } from "@firstack/hookless";

const SmartSelect = hookless(({ getProps, onMount, onProps }) => {
  // Component setup logic here ...

  // getProps and get<State> functions avoids stale closure issues
  const [getSelection, setSelection] = createState(getProps().options[0]);
  const selectRef = createRef();
  let renderCount = 0;

  function commitSelection(value) {
    setSelection(value);
    getProps().onChange?.(value);
  }

  // onProps and onMount reduces need for useEffects
  onProps((changedProps) => {
    if (changedProps.includes("options")) {
      setSelection(getProps().options[0], false);
    }
  });

  onMount(() => {
    selectRef.current?.focus();
  });

  return {
    render() {
      renderCount += 1;
      const { label, options } = getProps();
      const selection = getSelection();

      return html\`
        <section>
          <strong>\${label}</strong>
          <div>renders: \${renderCount}</div>
          <select
            ref=\${selectRef}
            value=\${selection}
            onChange=\${(event) => commitSelection(event.currentTarget.value)}
          >
            \${options.map((option) => html\`<option value=\${option}>\${option}</option>\`)}
          </select>
        </section>
      \`;
    },

    // You can add methods to the instance model here so that parent components can call them via refs.
    // example:
    // moveSelectionDown() {
    //   const options = getProps().options;
    //   setSelection((getSelection() + 1) % options.length);
    //   update();
    // },
  };
}, {
  // Options enabled by default.
  memo: true,
  autoEffectEvent: true,
});`;

const SmartSelect = hookless(
  ({ getProps, onMount, onProps }) => {
    const [getSelection, setSelection] = createState(getProps().options[0]);
    const selectRef = createRef();
    let renderCount = 0;

    function commitSelection(value) {
      setSelection(value);
      getProps().onChange?.(value);
    }

    onProps((changedProps) => {
      if (changedProps.includes("options")) {
        setSelection(getProps().options[0], false);
      }
    });

    onMount(() => {
      selectRef.current?.focus();
    });

    return {
      render() {
        renderCount += 1;
        const { label, options } = getProps();
        const selection = getSelection();

        return html`
          <section class="panel panel-accent">
            <div class="panelHeader">
              <div>
                <div class="eyebrow">Child Component (Uses Hookless)</div>
                <h3>${label}</h3>
              </div>
              <div class="stat">
                <span>renders</span>
                <strong>${renderCount}</strong>
              </div>
            </div>

            <div class="selectRow">
              <select
                ref=${selectRef}
                value=${selection}
                onChange=${(event) => commitSelection(event.currentTarget.value)}
              >
                ${options.map((option) => html`<option value=${option}>${option}</option>`)}
              </select>
              <button
                class="ghostButton"
                onClick=${() => {
                  const index = options.indexOf(selection);
                  commitSelection(options[(index + 1) % options.length]);
                }}
              >
                Next Option
              </button>
            </div>

            <div class="infoGrid">
              <div>
                <span>selection</span>
                <strong>${selection}</strong>
              </div>
              <div>
                <span>options</span>
                <strong>${options.join(" / ")}</strong>
              </div>
            </div>
          </section>
        `;
      },
    };
  },
  {
    memo: true,
    autoEffectEvent: true,
  },
);

function App() {
  const [appRenderCount, setAppRenderCount] = useState(1);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [lastEvent, setLastEvent] = useState("Nothing selected yet.");
  const options = palettes[paletteIndex];

  useEffect(() => {
    hljs.highlightAll();
  });

  function handleSelectionChange(value) {
    setLastEvent(`Selected ${value} during app render ${appRenderCount}.`);
  }

  return html`
    <main class="page">
      <section class="hero">
        <div class="eyebrow">Demo</div>
        <h1>Hookless keeps component state local while prop updates stay predictable.</h1>
        <p>
          Trigger a parent rerender and notice the child render count does not change. Swap the
          options array and the component rerenders once, resets its selection from
          <code>onProps</code>, and keeps using the latest <code>onChange</code> closure.
        </p>
      </section>

      <section class="panel">
        <div class="panelHeader">
          <div>
            <div class="eyebrow">Parent State</div>
            <h2>App controls</h2>
          </div>
          <div class="stat">
            <span>renders</span>
            <strong>${appRenderCount}</strong>
          </div>
        </div>

        <div class="buttonRow">
          <button class="primaryButton" onClick=${() => setAppRenderCount((value) => value + 1)}>
            Trigger Parent Rerender
          </button>
          <button
            class="ghostButton"
            onClick=${() => setPaletteIndex((value) => (value + 1) % palettes.length)}
          >
            Swap Options
          </button>
        </div>

        <p class="status">${lastEvent}</p>
      </section>

      <${SmartSelect}
        label="Color picker"
        options=${options}
        onChange=${handleSelectionChange}
      />

      <details class="panel">
        <summary>Code</summary>
        <pre class="codeBlock"><code class="language-js">${demoSource}</code></pre>
      </details>
    </main>
  `;
}

hljs.registerLanguage("javascript", javascript);

render(html`<${App} />`, document.getElementById("root"));
