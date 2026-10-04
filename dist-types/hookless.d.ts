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
export function createState<T>(initialValue: T, deep?: boolean): [() => T, (valueOrSetter: T | ((value: T) => T), callback?: false | RenderCallback) => void];
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
export function hookless<Props extends PropsRecord, Model extends HooklessModel>(factory: (api: {
    effect: (handler: EffectHandler, getDependencies?: () => unknown[]) => void;
    getContext: <T>(context: import("preact").Context<T>) => () => T;
    getProps: () => Props;
    layoutEffect: (handler: EffectHandler, getDependencies?: () => unknown[]) => void;
    update: (callback?: RenderCallback) => void;
}) => Model, options?: HooklessOptions): import("preact").FunctionComponent<Props>;
export type ComponentChildren = import("preact").ComponentChildren;
export type PropsRecord = Record<string, any>;
export type RenderCallback = () => void;
export type EffectHandler = () => void | (() => void);
export type EffectRecord = {
    getDependencies?: () => unknown[];
    handler: EffectHandler;
};
export type ContextBinding = {
    context: import("preact").Context<any>;
    get: () => any;
    value: any;
};
export type MemoConfig = {
    enabled: boolean;
    only: Set<string> | null;
    exclude: Set<string> | null;
};
export type EventConfig = {
    enabled: boolean;
    include: Set<string> | null;
    exclude: Set<string> | null;
};
export type EventProxy = ((...args: any[]) => any) & {
    current?: ((...args: any[]) => any) | null;
};
export type HooklessModel = {
    render(): ComponentChildren;
};
export type HooklessOptions = {
    autoEffectEvent?: boolean | {
        include?: string[];
        exclude?: string[];
    };
    memo?: boolean | {
        exclude?: string[];
        only?: string[];
    };
};
export type HooklessRuntime = {
    eventConfig: EventConfig;
    memoConfig: MemoConfig;
    contexts: Map<import("preact").Context<any>, ContextBinding>;
    effects: EffectRecord[];
    eventProps: Record<string, EventProxy>;
    forceRender: () => void;
    isRendering: boolean;
    lastProps: PropsRecord | null;
    lastRenderVersion: number;
    lastVNode: ComponentChildren | typeof Nil;
    layoutEffects: EffectRecord[];
    model: HooklessModel | null;
    pendingCallbacks: RenderCallback[];
    props: PropsRecord;
    renderVersion: number;
};
import { createRef } from "preact";
import { isEqual } from "./utils.js";
declare const Nil: unique symbol;
export { createRef, isEqual };
