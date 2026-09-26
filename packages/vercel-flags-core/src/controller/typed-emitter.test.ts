import { describe, expect, it, vi } from 'vitest';
import { TypedEmitter } from './typed-emitter';

// Concrete subclass so we can call the protected emit() and expose internals
type TestEvents = {
  foo: (value: string) => void;
  bar: () => void;
};

class TestEmitter extends TypedEmitter<TestEvents> {
  emit<E extends keyof TestEvents>(
    event: E,
    ...args: Parameters<TestEvents[E]>
  ): void {
    super.emit(event, ...args);
  }
}

describe('TypedEmitter', () => {
  describe('off() / removeListener cleanup', () => {
    it('should remove the handlers Map entry when the last listener for an event is removed', () => {
      const emitter = new TestEmitter();
      const handler = vi.fn();

      emitter.on('foo', handler);

      // Sanity-check: handler is wired
      expect((emitter as any).handlers.has('foo')).toBe(true);
      expect((emitter as any).handlers.get('foo')!.size).toBe(1);

      emitter.off('foo', handler);

      // After removing the last subscriber the Map entry for 'foo' should be gone.
      expect((emitter as any).handlers.has('foo')).toBe(false);
    });

    it('should not fire a handler after it has been removed via off()', () => {
      const emitter = new TestEmitter();
      const handler = vi.fn();

      emitter.on('foo', handler);
      emitter.off('foo', handler);
      emitter.emit('foo', 'test-value');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should keep the Map entry when there are still remaining listeners', () => {
      const emitter = new TestEmitter();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('foo', handler1);
      emitter.on('foo', handler2);
      emitter.off('foo', handler1);

      // handler2 still registered — Map entry must remain
      expect((emitter as any).handlers.has('foo')).toBe(true);
      expect((emitter as any).handlers.get('foo')!.size).toBe(1);
    });
  });

  // ---- ADVERSARIAL EDGE CASES ----

  describe('edge case 1: off() for event that was never registered', () => {
    it('should be a no-op and not throw when handler was never registered', () => {
      const emitter = new TestEmitter();
      const handler = vi.fn();

      // 'foo' was never registered — Map.get returns undefined → guard `if (!set) return` fires
      expect(() => emitter.off('foo', handler)).not.toThrow();

      expect((emitter as any).handlers.has('foo')).toBe(false);
    });
  });

  describe('edge case 2: off() with multiple handlers — partial removal', () => {
    it('removes only the targeted handler and keeps the Map entry while others remain', () => {
      const emitter = new TestEmitter();
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      emitter.on('foo', handlerA);
      emitter.on('foo', handlerB);

      emitter.off('foo', handlerA);

      // Map entry must remain (handlerB still subscribed)
      const set = (emitter as any).handlers.get('foo') as Set<unknown>;
      expect(set).toBeDefined();
      expect(set.size).toBe(1);

      // After removing the second handler, Map entry must be gone
      emitter.off('foo', handlerB);
      expect((emitter as any).handlers.has('foo')).toBe(false);
    });

    it('fires only the remaining handler after partial off()', () => {
      const emitter = new TestEmitter();
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      emitter.on('foo', handlerA);
      emitter.on('foo', handlerB);
      emitter.off('foo', handlerA);

      emitter.emit('foo', 'hello');

      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalledOnce();
      expect(handlerB).toHaveBeenCalledWith('hello');
    });
  });

  describe('edge case 3: off() called twice for the same handler (double-unsubscribe)', () => {
    it('should not throw on second off() call', () => {
      const emitter = new TestEmitter();
      const handler = vi.fn();

      emitter.on('foo', handler);
      emitter.off('foo', handler);

      // Second off() — Map entry is already gone, guard returns early
      expect(() => emitter.off('foo', handler)).not.toThrow();

      expect((emitter as any).handlers.has('foo')).toBe(false);
    });
  });

  describe('edge case 4: on() after off() — resubscribe', () => {
    it('re-creates the Map entry and fires on emit after resubscribe', () => {
      const emitter = new TestEmitter();
      const handler = vi.fn();

      emitter.on('foo', handler);
      emitter.off('foo', handler);

      expect((emitter as any).handlers.has('foo')).toBe(false);

      // Resubscribe — on() must create a fresh Set and wire correctly
      emitter.on('foo', handler);

      expect((emitter as any).handlers.has('foo')).toBe(true);
      expect((emitter as any).handlers.get('foo')!.size).toBe(1);

      emitter.emit('foo', 'resubscribed');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith('resubscribed');
    });

    it('the old (deleted) Set reference is stale and not consulted after resubscribe', () => {
      const emitter = new TestEmitter();
      const handler = vi.fn();

      emitter.on('foo', handler);

      // Grab a reference to the old Set before it is deleted
      const oldSet = (emitter as any).handlers.get('foo') as Set<unknown>;

      emitter.off('foo', handler);

      // After off(), the old Set is empty and no longer in the Map
      expect(oldSet.size).toBe(0);
      expect((emitter as any).handlers.has('foo')).toBe(false);

      // Resubscribe — a brand-new Set is created
      emitter.on('foo', handler);

      const newSet = (emitter as any).handlers.get('foo') as Set<unknown>;

      // The new Set is distinct from the old one
      expect(newSet).not.toBe(oldSet);
      expect(newSet.size).toBe(1);

      // The old Set remains empty — emit reads from newSet only
      expect(oldSet.size).toBe(0);

      emitter.emit('foo', 'check');
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('edge case 5: once()-like pattern via manual wrapper (no built-in once())', () => {
    // TypedEmitter has no once() method. We test the manual pattern users might employ:
    // wrapping a handler in a self-removing closure. Verifies that off() inside
    // the emit loop (handler removes itself during iteration) works safely.
    it('self-removing handler inside emit does not throw and is not called again', () => {
      const emitter = new TestEmitter();
      const innerSpy = vi.fn();

      const onceHandler = (value: string): void => {
        emitter.off('foo', onceHandler);
        innerSpy(value);
      };

      emitter.on('foo', onceHandler);
      emitter.emit('foo', 'first');

      expect(innerSpy).toHaveBeenCalledOnce();
      expect(innerSpy).toHaveBeenCalledWith('first');

      // Second emit — handler was removed, should not fire again
      emitter.emit('foo', 'second');
      expect(innerSpy).toHaveBeenCalledOnce(); // still only once
    });
  });

  describe('edge case 6: different event keys are independent', () => {
    it('removing all handlers for event A does not affect event B', () => {
      const emitter = new TestEmitter();
      const handlerFoo = vi.fn();
      const handlerBar = vi.fn();

      emitter.on('foo', handlerFoo);
      emitter.on('bar', handlerBar);

      // Remove all listeners for 'foo'
      emitter.off('foo', handlerFoo);

      // 'foo' entry must be gone
      expect((emitter as any).handlers.has('foo')).toBe(false);

      // 'bar' entry must remain untouched
      expect((emitter as any).handlers.has('bar')).toBe(true);
      expect((emitter as any).handlers.get('bar')!.size).toBe(1);

      // bar handler still fires
      emitter.emit('bar');
      expect(handlerBar).toHaveBeenCalledOnce();
      expect(handlerFoo).not.toHaveBeenCalled();
    });
  });

  describe('edge case 7: emit() after all handlers for an event are off()', () => {
    it('does not throw when emitting on a key that was removed from the Map', () => {
      const emitter = new TestEmitter();
      const handler = vi.fn();

      emitter.on('foo', handler);
      emitter.off('foo', handler);

      // Map entry for 'foo' is now gone — emit() should short-circuit via the
      // `if (set)` guard and never call the deleted handler
      expect(() => emitter.emit('foo', 'after-removal')).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });

    it('correctly fires a handler added back after a full clear', () => {
      const emitter = new TestEmitter();
      const handler = vi.fn();

      emitter.on('foo', handler);
      emitter.off('foo', handler);
      emitter.emit('foo', 'silent'); // no-op emit while no handlers

      // Re-register and emit
      emitter.on('foo', handler);
      emitter.emit('foo', 'loud');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith('loud');
    });
  });
});
