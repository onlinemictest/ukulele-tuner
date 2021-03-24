export const range = (from: number, to: number) => [...Array(to - from + 1).keys()].map(x => x + from);
export const rangeX = (from: number, to: number) => [...Array(to - from).keys()].map(x => x + from);

export const flat = <X>(xs: (X | X[])[]) => (<X[]>[]).concat(...xs)

export const queue = <T>(a: T[] | null | undefined, x: T) => 
  (a?.pop(), a?.unshift(x), a);

export const closest = (a: number[], goal: number) => 
  a.reduce((prev, curr) => (Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev));

export const closestBy = <X>(xs: X[], goal: X, distFn: (a: X, b: X) => number) => 
  xs.reduce((prev, curr) => (distFn(curr, goal) < distFn(prev, goal) ? curr : prev));