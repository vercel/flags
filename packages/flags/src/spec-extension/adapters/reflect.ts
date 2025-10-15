// copied from Next.js, and reduced
// https://github.com/vercel/next.js/tree/canary/packages/next/src/server/web/spec-extension
// biome-ignore lint/complexity/noStaticOnlyClass: Copied over from Next.js
export class ReflectAdapter {
  static get<T extends object>(
    target: T,
    prop: string | symbol,
    receiver: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function") {
      return value.bind(target);
    }

    return value;
  }

  static set<T extends object>(
    target: T,
    prop: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    receiver: any,
  ): boolean {
    return Reflect.set(target, prop, value, receiver);
  }

  static has<T extends object>(target: T, prop: string | symbol): boolean {
    return Reflect.has(target, prop);
  }

  static deleteProperty<T extends object>(
    target: T,
    prop: string | symbol,
  ): boolean {
    return Reflect.deleteProperty(target, prop);
  }
}
