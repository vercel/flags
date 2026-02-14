/**
 * Lightweight typed event emitter base class.
 * Each source module extends this to emit typed events.
 */
export class TypedEmitter<
  Events extends Record<string, (...args: any[]) => void>,
> {
  private handlers = new Map<keyof Events, Set<Events[keyof Events]>>();

  on<E extends keyof Events>(event: E, handler: Events[E]): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Events[keyof Events]);
  }

  off<E extends keyof Events>(event: E, handler: Events[E]): void {
    this.handlers.get(event)?.delete(handler as Events[keyof Events]);
  }

  protected emit<E extends keyof Events>(
    event: E,
    ...args: Parameters<Events[E]>
  ): void {
    const set = this.handlers.get(event);
    if (set) {
      for (const handler of set) {
        (handler as (...a: any[]) => void)(...args);
      }
    }
  }
}
