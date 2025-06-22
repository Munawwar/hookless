import { isValidElement } from "preact";

/**
 * Deep equality helper with special handling for Preact VNodes.
 *
 * @param {unknown} value1
 * @param {unknown} value2
 * @returns {boolean}
 */
export function isEqual(value1, value2) {
  // Handle circular references using WeakMap
  const seenA = new WeakMap();
  const seenB = new WeakMap();

  /**
   * @param {any} a
   * @param {any} b
   * @returns {boolean}
   */
  function deepCompare(a, b) {
    // Handle primitives
    if (Object.is(a, b)) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
      return a === b;
    }

    // Handle Preact VNodes / compat elements by reference.
    // Deep-comparing VNode internals is expensive and misleading.
    if (isValidElement(a) || isValidElement(b)) {
      return a === b;
    }

    const prototype = Object.getPrototypeOf(a);
    if (prototype !== Object.getPrototypeOf(b)) {
      return false;
    }

    // Check for circular references
    if (seenA.has(a)) return seenA.get(a) === b;
    if (seenB.has(b)) return seenB.get(b) === a;
    // detect cross object circular references
    if (seenA.has(b) || seenB.has(a)) return false;
    seenA.set(a, b);
    seenB.set(b, a);

    // Handle Arrays
    if (Array.isArray(a)) {
      if (a.length !== b.length) {
        return false;
      }
      return a.every((item, index) => deepCompare(item, b[index]));
    }

    // Handle Dates
    if (a instanceof Date) {
      return a.getTime() === b.getTime();
    }

    // Handle RegExp
    if (a instanceof RegExp) {
      return a.toString() === b.toString();
    }

    // Only plain objects and arrays get structural deep comparison.
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => keysB.includes(key) && deepCompare(a[key], b[key]));
  }

  return deepCompare(value1, value2);
}
