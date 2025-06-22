import { createRef } from "preact";
import { useEffect, useReducer, useRef } from "preact/hooks";
import { isEqual } from "./utils.js";

/** @typedef {import("preact").ComponentChildren} ComponentChildren */
/** @typedef {Record<string, any>} PropsRecord */
/** @typedef {() => void} RenderCallback */
/** @typedef {(changedProps: string[], oldProps: PropsRecord) => void} PropHandler */
/** @typedef {() => void | (() => void)} MountHandler */
/** @typedef {{ enabled: boolean, only: Set<string> | null, exclude: Set<string> | null }} MemoConfig */
/** @typedef {{ enabled: boolean, include: Set<string> | null, exclude: Set<string> | null }} EventConfig */
/** @typedef {((...args: any[]) => any) & { current?: ((...args: any[]) => any) | null }} EventProxy */
/** @typedef {{ render(): ComponentChildren }} HooklessModel */
/** @typedef {{
 *   autoEffectEvent?: boolean | { include?: string[], exclude?: string[] },
 *   memo?: boolean | { exclude?: string[], only?: string[] },
 * }} HooklessOptions
 */
/** @typedef {{
 *   eventConfig: EventConfig,
 *   memoConfig: MemoConfig,
 *   eventProps: Record<string, EventProxy>,
 *   forceRender: () => void,
 *   isRendering: boolean,
 *   lastProps: PropsRecord | null,
 *   lastRenderVersion: number,
 *   lastVNode: ComponentChildren | typeof Nil,
 *   model: HooklessModel | null,
 *   mountHandlers: MountHandler[],
 *   pendingCallbacks: RenderCallback[],
 *   propHandlers: PropHandler[],
 *   props: PropsRecord,
 *   renderVersion: number,
 * }} HooklessRuntime
 */

/** @type {any[]} */
const emptyArray = [];
const Nil = Symbol("Nil");
const onEventPropPattern = /^on[A-Z]/;

/** @type {HooklessRuntime | null} */
let currentRuntime = null;

/**
 * @param {HooklessRuntime} runtime
 * @param {false | RenderCallback | undefined} callback
 * @returns {void}
 */
function queueRender(runtime, callback) {
  if (typeof callback === "function") runtime.pendingCallbacks.push(callback);
  if (runtime.isRendering) return;
  runtime.renderVersion += 1;
  runtime.forceRender();
}

/**
 * Creates hookless local state with a stable getter.
 *
 * @template T
 * @param {T} initialValue
 * @param {boolean} [deep=true]
 * @returns {[
 *   () => T,
 *   (valueOrSetter: T | ((value: T) => T), callback?: false | RenderCallback) => void,
 * ]}
 */
export function createState(initialValue, deep = true) {
  const runtime = currentRuntime;
  if (!runtime) {
    throw new Error("createState() can only be used while creating a hookless component.");
  }
  const compare = deep ? isEqual : Object.is;
  let value = initialValue;

  return [
    () => value,
    (valueOrSetter, callback) => {
      const nextValue =
        typeof valueOrSetter === "function"
          ? /** @type {(value: T) => T} */ (valueOrSetter)(value)
          : valueOrSetter;
      if (compare(nextValue, value)) return;
      value = nextValue;
      if (callback !== false) queueRender(runtime, callback);
    },
  ];
}

/**
 * Creates a Preact component from an instance-like model.
 *
 * @template {PropsRecord} Props
 * @template {HooklessModel} Model
 * @param {(api: {
 *   getProps: () => Props,
 *   onProps: (handler: (changedProps: string[], oldProps: Props) => void) => void,
 *   onMount: (handler: () => void | (() => void)) => void,
 *   update: (callback?: RenderCallback) => void,
 * }) => Model} factory
 * @param {HooklessOptions} [options={}]
 * @returns {import("preact").FunctionComponent<Props>}
 */
export function hookless(factory, options = {}) {
  /**
   * @param {Props} rawProps
   * @returns {ComponentChildren}
   */
  function HooklessComponent(rawProps) {
    const [, bumpRender] = useReducer((value, _action) => value + 1, 0);
    const runtimeRef = useRef(/** @type {HooklessRuntime | null} */ (null));
    const forceRender = () => bumpRender(null);
    if (!runtimeRef.current) {
      const memoOnly =
        options.memo && options.memo !== true && options.memo.only?.length
          ? new Set(options.memo.only)
          : null;
      runtimeRef.current = {
        eventConfig:
          options.autoEffectEvent === false
            ? { enabled: false, include: null, exclude: null }
            : {
                enabled: true,
                include: new Set(
                  options.autoEffectEvent && options.autoEffectEvent !== true
                    ? (options.autoEffectEvent.include ?? emptyArray)
                    : emptyArray,
                ),
                exclude: new Set(
                  options.autoEffectEvent && options.autoEffectEvent !== true
                    ? (options.autoEffectEvent.exclude ?? emptyArray)
                    : emptyArray,
                ),
              },
        memoConfig:
          options.memo === false
            ? { enabled: false, only: null, exclude: null }
            : {
                enabled: true,
                only: memoOnly,
                exclude: memoOnly
                  ? null
                  : new Set(
                      options.memo && options.memo !== true
                        ? (options.memo.exclude ?? emptyArray)
                        : emptyArray,
                    ),
              },
        eventProps: Object.create(null),
        forceRender,
        isRendering: false,
        lastProps: null,
        lastRenderVersion: -1,
        lastVNode: Nil,
        model: null,
        mountHandlers: [],
        pendingCallbacks: [],
        propHandlers: [],
        props: {},
        renderVersion: 0,
      };
    }
    const runtime = runtimeRef.current;
    const oldProps = /** @type {Props} */ (runtime.props);
    const prevRawProps = runtime.lastProps;

    runtime.forceRender = forceRender;
    // Normalize props for the model and structurally share unchanged values.
    // Event-like props get stable proxies so handler identity can change freely.
    /** @type {PropsRecord} */
    const nextProps = {};
    /** @type {string[]} */
    const changedProps = [];
    for (const key of new Set([...Object.keys(prevRawProps ?? {}), ...Object.keys(rawProps)])) {
      const hasNext = Object.prototype.hasOwnProperty.call(rawProps, key);
      const value = rawProps[key];
      const prevValue = prevRawProps?.[key];
      const isAutoEvent = Boolean(
        runtime.eventConfig.enabled &&
          !runtime.eventConfig.exclude?.has(key) &&
          (onEventPropPattern.test(key) || runtime.eventConfig.include?.has(key)),
      );
      const ignoreChange = Boolean(
        prevRawProps &&
          isAutoEvent &&
          (typeof prevValue === "function" ||
            typeof value === "function" ||
            prevValue == null ||
            value == null),
      );
      if (!hasNext) {
        if (!ignoreChange) changedProps.push(key);
        continue;
      }

      let normalizedValue = value;
      if (isAutoEvent && typeof value === "function") {
        let proxy = runtime.eventProps[key];
        if (!proxy) {
          /** @type {EventProxy} */
          const eventProxy = (...args) => eventProxy.current?.(...args);
          eventProxy.current = null;
          proxy = runtime.eventProps[key] = eventProxy;
        }
        proxy.current = value;
        normalizedValue = proxy;
      }

      if (ignoreChange) {
        nextProps[key] = normalizedValue;
        continue;
      }
      const useDeepCompare =
        runtime.memoConfig.enabled &&
        (runtime.memoConfig.only
          ? runtime.memoConfig.only.has(key)
          : !runtime.memoConfig.exclude?.has(key));
      const hasChanged = useDeepCompare ? !isEqual(prevValue, value) : !Object.is(prevValue, value);
      nextProps[key] = hasChanged ? normalizedValue : oldProps[key];
      if (hasChanged) {
        changedProps.push(key);
      }
    }
    runtime.props = nextProps;

    // Create the instance model once, then keep reusing it across renders.
    if (!runtime.model) {
      currentRuntime = runtime;
      try {
        runtime.model = factory({
          getProps: () => /** @type {Props} */ (runtime.props),
          onProps: (handler) => runtime.propHandlers.push(/** @type {PropHandler} */ (handler)),
          onMount: (handler) => runtime.mountHandlers.push(handler),
          update: (callback) => queueRender(runtime, callback),
        });
      } finally {
        currentRuntime = null;
      }
    }

    // Run prop handlers before render, then reuse the previous vnode when
    // neither props nor an explicit update changed the render output.
    runtime.isRendering = true;
    try {
      if (changedProps.length) {
        for (const handler of runtime.propHandlers) handler(changedProps, oldProps);
      }
      if (
        runtime.lastVNode === Nil ||
        changedProps.length > 0 ||
        runtime.lastRenderVersion !== runtime.renderVersion
      ) {
        runtime.lastVNode = runtime.model.render();
        runtime.lastRenderVersion = runtime.renderVersion;
      }
    } finally {
      runtime.isRendering = false;
      runtime.lastProps = rawProps;
    }

    // Flush post-render callbacks queued by update() or createState().
    useEffect(() => {
      if (!runtime.pendingCallbacks.length) return;
      for (const callback of runtime.pendingCallbacks.splice(0)) callback();
    });

    // biome-ignore lint/correctness/useExhaustiveDependencies: mount handlers are fixed when the model is created
    useEffect(() => {
      /** @type {(() => void)[]} */
      const cleanups = [];
      for (const handler of runtime.mountHandlers) {
        const cleanup = handler();
        if (typeof cleanup === "function") cleanups.push(cleanup);
      }
      return () => {
        while (cleanups.length) cleanups.pop()?.();
      };
    }, []);

    return runtime.lastVNode;
  }

  Object.defineProperty(HooklessComponent, "name", {
    value: factory.name ? `Hookless${factory.name}` : "HooklessComponent",
  });

  return HooklessComponent;
}
export { createRef, isEqual };
