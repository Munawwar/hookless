import { createRef } from "preact";
import { useContext, useEffect, useLayoutEffect, useReducer, useRef } from "preact/hooks";
import { isEqual } from "./utils.js";

/** @typedef {import("preact").ComponentChildren} ComponentChildren */
/** @typedef {Record<string, any>} PropsRecord */
/** @typedef {() => void} RenderCallback */
/** @typedef {() => void | (() => void)} EffectHandler */
/** @typedef {{ getDependencies?: () => unknown[], handler: EffectHandler }} EffectRecord */
/** @typedef {{ context: import("preact").Context<any>, get: () => any, value: any }} ContextBinding */
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
 *   contexts: Map<import("preact").Context<any>, ContextBinding>,
 *   effects: EffectRecord[],
 *   eventProps: Record<string, EventProxy>,
 *   forceRender: () => void,
 *   isRendering: boolean,
 *   lastProps: PropsRecord | null,
 *   lastRenderVersion: number,
 *   lastVNode: ComponentChildren | typeof Nil,
 *   layoutEffects: EffectRecord[],
 *   model: HooklessModel | null,
 *   pendingCallbacks: RenderCallback[],
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
 *   effect: (handler: EffectHandler, getDependencies?: () => unknown[]) => void,
 *   getContext: <T>(context: import("preact").Context<T>) => () => T,
 *   getProps: () => Props,
 *   layoutEffect: (handler: EffectHandler, getDependencies?: () => unknown[]) => void,
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
        contexts: new Map(),
        effects: [],
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
        layoutEffects: [],
        model: null,
        pendingCallbacks: [],
        props: {},
        renderVersion: 0,
      };
    }
    const runtime = runtimeRef.current;
    const previousProps = runtime.props;
    const prevRawProps = runtime.lastProps;
    let contextChanged = false;

    if (runtime.model) {
      for (const binding of runtime.contexts.values()) {
        const value = useContext(binding.context);
        if (!Object.is(value, binding.value)) contextChanged = true;
        binding.value = value;
      }
    }

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
          typeof prevValue === "function" &&
          typeof value === "function",
      );
      if (!hasNext) {
        if (isAutoEvent && runtime.eventProps[key]) runtime.eventProps[key].current = null;
        changedProps.push(key);
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
      } else if (isAutoEvent && runtime.eventProps[key]) {
        runtime.eventProps[key].current = null;
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
      nextProps[key] = hasChanged ? normalizedValue : previousProps[key];
      if (hasChanged) {
        changedProps.push(key);
      }
    }
    runtime.props = nextProps;

    // Create the instance model once, then keep reusing it across renders.
    if (!runtime.model) {
      currentRuntime = runtime;
      try {
        /**
         * @param {EffectRecord[]} effects
         * @param {EffectHandler} handler
         * @param {(() => unknown[]) | undefined} getDependencies
         */
        const registerEffect = (effects, handler, getDependencies) => {
          if (currentRuntime !== runtime) {
            throw new Error("Effects can only be registered during component setup.");
          }
          effects.push({ getDependencies, handler });
        };
        runtime.model = factory({
          effect: (handler, getDependencies) =>
            registerEffect(runtime.effects, handler, getDependencies),
          getContext: (context) => {
            const existing = runtime.contexts.get(context);
            if (existing) return existing.get;
            if (currentRuntime !== runtime) {
              throw new Error("getContext() must register each context during component setup.");
            }
            const binding = /** @type {ContextBinding} */ ({
              context,
              get: () => binding.value,
              value: useContext(context),
            });
            runtime.contexts.set(context, binding);
            return binding.get;
          },
          getProps: () => /** @type {Props} */ (runtime.props),
          layoutEffect: (handler, getDependencies) =>
            registerEffect(runtime.layoutEffects, handler, getDependencies),
          update: (callback) => queueRender(runtime, callback),
        });
      } finally {
        currentRuntime = null;
      }
    }

    // Reuse the previous vnode when no input or explicit update changed the render output.
    runtime.isRendering = true;
    try {
      if (
        runtime.lastVNode === Nil ||
        changedProps.length > 0 ||
        contextChanged ||
        runtime.lastRenderVersion !== runtime.renderVersion
      ) {
        runtime.lastVNode = runtime.model.render();
        runtime.lastRenderVersion = runtime.renderVersion;
      }
    } finally {
      runtime.isRendering = false;
      runtime.lastProps = rawProps;
    }

    // Flush callbacks after Preact commits the render.
    useEffect(() => {
      for (const callback of runtime.pendingCallbacks.splice(0)) callback();
    });

    for (const effect of runtime.layoutEffects) {
      useLayoutEffect(effect.handler, effect.getDependencies?.());
    }
    for (const effect of runtime.effects) {
      useEffect(effect.handler, effect.getDependencies?.());
    }

    return runtime.lastVNode;
  }

  Object.defineProperty(HooklessComponent, "name", {
    value: factory.name ? `Hookless${factory.name}` : "HooklessComponent",
  });

  return HooklessComponent;
}
export { createRef, isEqual };
