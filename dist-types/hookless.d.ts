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
 *   getProps: () => Props,
 *   onProps: (handler: (changedProps: string[], oldProps: Props) => void) => void,
 *   onMount: (handler: () => void | (() => void)) => void,
 *   update: (callback?: RenderCallback) => void,
 * }) => Model} factory
 * @param {HooklessOptions} [options={}]
 * @returns {import("preact").FunctionComponent<Props>}
 */
export function hookless<Props extends PropsRecord, Model extends HooklessModel>(factory: (api: {
    getProps: () => Props;
    onProps: (handler: (changedProps: string[], oldProps: Props) => void) => void;
    onMount: (handler: () => void | (() => void)) => void;
    update: (callback?: RenderCallback) => void;
}) => Model, options?: HooklessOptions): import("preact").FunctionComponent<Props>;
export type ComponentChildren = import("preact").ComponentChildren;
export type PropsRecord = Record<string, any>;
export type RenderCallback = () => void;
export type PropHandler = (changedProps: string[], oldProps: PropsRecord) => void;
export type MountHandler = () => void | (() => void);
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
    eventProps: Record<string, EventProxy>;
    forceRender: () => void;
    isRendering: boolean;
    lastProps: PropsRecord | null;
    lastRenderVersion: number;
    lastVNode: ComponentChildren | typeof Nil;
    model: HooklessModel | null;
    mountHandlers: MountHandler[];
    pendingCallbacks: RenderCallback[];
    propHandlers: PropHandler[];
    props: PropsRecord;
    renderVersion: number;
};
import { createRef } from "preact";
import { isEqual } from "./utils.js";
declare const Nil: unique symbol;
export { createRef, isEqual };
