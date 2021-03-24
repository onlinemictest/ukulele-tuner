export const set = (obj: any, prop: any, value: any) => obj && (obj[prop] = value);
export const isTruthy = (x: any) => !!x;
export const isFalsey = (x: any) => !x;
export const throwError = (m?: string) => { throw Error(m) };

export function once<T extends Element, K extends keyof ElementEventMap>(el: T, ev: K): Promise<ElementEventMap[K]>;
export function once<T extends ScriptProcessorNode, K extends keyof ScriptProcessorNodeEventMap>(el: T, ev: K): Promise<ScriptProcessorNodeEventMap[K]>;
export function once<T extends EventTarget>(el: T, ev: string): Promise<Event>;
export function once<T extends EventTarget>(el: T, ev: string) { 
  return new Promise(r => el.addEventListener(ev, r, { once: true }));
}

export const timeout = (t: number) => new Promise(r => setTimeout(r, t));

export const debounce = (delay: number, fn: (...args: any[]) => any) => {
  let timer: number;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

export const throttle = (limit: number, fn: (...args: any[]) => any) => {
  let wait = false;
  let last: any[];
  return (...args: any[]) => {
    last = args;
    if (!wait) {
      fn(...args);
      wait = true;
      setTimeout(() => { 
        wait = false;
        fn(...last);
      }, limit);
    }
  }
};

export function fromEntries<T = any>(entries: Iterable<readonly [PropertyKey, T]>): { [k: string]: T };
export function fromEntries(entries: Iterable<readonly any[]>): any;
export function fromEntries(entries: Iterable<readonly any[]>): any {
  return [...entries].reduce((obj, [key, val]) => {
    obj[key] = val;
    return obj;
  }, {} as any)
}
