# `@firstack/hookless`

Hookless component model for Preact.

Hookless has hooks in the same way serverless has servers: they are still there, just different.

(Do not use in production yet.)

## Why

I wanted a simpler component and utilities to
- avoid stale closures (with states and props now using a getter function)
- be forgiving to re-render from unintentional child prop changes (with prop-level memoization and auto useEffectEvent()-ing of `on*` props)
- reduce the previous mentioned case and useMemo()/useCallback()s by having a component setup scope (think class constructor, but render method having the closure access to them) 
- make vdom diffing faster if no prop changed (auto memoize jsx / vdom)
- keep effects explicit without stale dependency closures

This project is an attempt to avoid many performance footguns [as I documented here](https://gist.github.com/Munawwar/9dad5823ee13d91eec415212d350c78d.) combining it with a simpler component model.


## Main API

### `hookless(factory, options?)`

Creates a Preact component from an instance-like model.

```js
import { hookless, createRef, createState } from "@firstack/hookless";
import { html } from "htm/preact";

const Counter = hookless(({ effect, getContext, getProps, layoutEffect, update }) => {
  // Component setup logic here ...

  // getProps and get<State> functions avoids stale closure issues
  const [getCount, setCount] = createState(0);
  // Or you could use `let count = 0` and manual update() calls

  // No need of useRef anymore
  const buttonRef = createRef();
  
  // Event handlers can be defined here. No need of useCallback().
  const onClick = () => setCount(getCount() + 1);

  // Both the effect and dependency getter always read current values.
  effect(() => {
    setCount(0);
  }, () => [getProps().resetKey]);

  layoutEffect(() => {
    buttonRef.current?.focus();
  }, () => []);

  // Contexts use stable getters too, so events and effects never capture stale values.
  // const getTheme = getContext(ThemeContext);

  return {
    render() {
      return html`
        <button ref=${buttonRef} onClick=${onClick}>
          ${getProps().label}: ${getCount()}
        </button>
      `;
    },

    // You can add methods to the instance model here so that parent components can call them via refs.
    // example:
    // incrementCounter() {
    //   setCount(getCount() + 1);
    // },
  };
}, {
  // These are enabled by default
  memo: true,
  autoEffectEvent: true,
});
```

`factory` receives:

- `getProps()`: returns the latest props
- `getContext(Context)`: subscribes to a Preact context and returns a stable getter for its latest
  value; call it during component setup
- `effect(handler, getDependencies?)`: runs after commit on mount and whenever a dependency
  changes by `Object.is`; the dependency getter is evaluated during each wrapper render
- `effect(handler)`: runs after every render; use `effect(handler, () => [])` for mount/unmount only
- `layoutEffect(handler, getDependencies?)`: has the same dependency behavior as `effect`, but runs
  synchronously after DOM updates and before the browser paints
- `update(callback?)`: forces a rerender; optional callback runs after render flush

Effects run after commit, so values needed by the same render should be derived during `render()`
rather than synchronized from an effect.

The object returned by `factory` must contain:

- `render()`: returns the component vnode

It may also contain any extra methods or fields you want to keep on the instance model.

### `hookless(..., options)`

`options.memo`

- `true`: enabled; all props are deep-compared
- `false`: disabled; props are compared with `Object.is`
- `{ only: ["value", "options"] }`: deep-compare only those props
- `{ exclude: ["children"] }`: deep-compare everything except those props

Notes:

- `memo` defaults to `true`
- `only` and `exclude` are mutually exclusive in intent; if both are passed, `only` wins

`options.autoEffectEvent`

- `true`: enabled; function props matching `on[A-Z]` are treated as stable event props
- `false`: disabled
- `{ include: ["handleClick"] }`: additionally treat these prop names as stable event props
- `{ exclude: ["onDebug"] }`: remove these prop names from the automatic `on[A-Z]` matching

Notes:

- `autoEffectEvent` defaults to `true`
- the default convention is `on[A-Z]`, so `onClick` matches and `oneClick` does not
- matched function props do not trigger rerenders by themselves and are proxied so the latest function is still called

### `createState(initialValue, deep?)`

Creates local hookless state.

```js
const [getValue, setValue] = createState(initialValue);
```

Arguments:

- `initialValue`: initial state value
- `deep`: comparison mode
  - `true` or omitted: uses deep equality
  - `false`: uses `Object.is`

Returned values:

- `getValue()`: stable getter for the latest state
- `setValue(nextValueOrUpdater, callback?)`

`setValue()` supports:

- `setValue(nextValue)`
- `setValue((prev) => nextValue)`
- `setValue(nextValue, callback)`
- `setValue(nextValue, false)` to update state without scheduling a rerender

### `createRef()`

Thin re-export of Preact `createRef()`.

### `isEqual(a, b)`

Deep equality helper used internally by Hookless.
