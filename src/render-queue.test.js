import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildRenderCacheKey, RenderQueue, roundForCacheKey } from "./render-queue.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCache() {
  const store = new Map();
  return {
    get: vi.fn(async (key) => store.get(key) ?? null),
    set: vi.fn(async (key, value) => store.set(key, value)),
    store,
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// roundForCacheKey
// ---------------------------------------------------------------------------

describe("roundForCacheKey", () => {
  it("rounds to 4 decimal places by default", () => {
    expect(roundForCacheKey(1.23456789)).toBe(1.2346);
  });

  it("accepts custom precision", () => {
    expect(roundForCacheKey(1.23456789, 2)).toBe(1.23);
  });

  it("handles integers", () => {
    expect(roundForCacheKey(5)).toBe(5);
  });

  it("handles negative values", () => {
    expect(roundForCacheKey(-0.12345)).toBe(-0.1235);
  });

  it("treats tiny floating-point differences as equal", () => {
    expect(roundForCacheKey(0.10001)).toBe(roundForCacheKey(0.10002));
  });
});

// ---------------------------------------------------------------------------
// buildRenderCacheKey
// ---------------------------------------------------------------------------

describe("buildRenderCacheKey", () => {
  const baseDna = { order: 3.0, warp: 1.5, fold: 0.8, spike: 0.25, chaos: 0.6, layers: 3 };
  const baseRotation = { x: 0.1, y: 0.2 };
  const baseCamera = {
    position: { x: 0, y: 0, z: 30 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  };

  function makeInput(overrides = {}) {
    return {
      style: "mineral",
      source: "ai",
      dna: baseDna,
      rotation: baseRotation,
      camera: baseCamera,
      ...overrides,
    };
  }

  it("produces a string", () => {
    expect(typeof buildRenderCacheKey(makeInput())).toBe("string");
  });

  it("same inputs produce identical keys", () => {
    expect(buildRenderCacheKey(makeInput())).toBe(buildRenderCacheKey(makeInput()));
  });

  it("different style → different key", () => {
    expect(buildRenderCacheKey(makeInput({ style: "mineral" }))).not.toBe(
      buildRenderCacheKey(makeInput({ style: "organ" }))
    );
  });

  it("different source → different key", () => {
    expect(buildRenderCacheKey(makeInput({ source: "ai" }))).not.toBe(
      buildRenderCacheKey(makeInput({ source: "reference" }))
    );
  });

  it("different dna parameter → different key", () => {
    expect(buildRenderCacheKey(makeInput({ dna: { ...baseDna, order: 3.0 } }))).not.toBe(
      buildRenderCacheKey(makeInput({ dna: { ...baseDna, order: 4.0 } }))
    );
  });

  it("different rotation → different key", () => {
    expect(buildRenderCacheKey(makeInput({ rotation: { x: 0.1, y: 0.2 } }))).not.toBe(
      buildRenderCacheKey(makeInput({ rotation: { x: 0.3, y: 0.2 } }))
    );
  });

  it("different camera position → different key", () => {
    expect(buildRenderCacheKey(makeInput())).not.toBe(
      buildRenderCacheKey(makeInput({ camera: { ...baseCamera, position: { x: 1, y: 0, z: 30 } } }))
    );
  });

  it("different camera quaternion → different key", () => {
    expect(buildRenderCacheKey(makeInput())).not.toBe(
      buildRenderCacheKey(
        makeInput({ camera: { ...baseCamera, quaternion: { x: 0.1, y: 0, z: 0, w: 0.995 } } })
      )
    );
  });

  it("rounds dna values for stable comparison", () => {
    expect(buildRenderCacheKey(makeInput({ dna: { ...baseDna, order: 3.00001 } }))).toBe(
      buildRenderCacheKey(makeInput({ dna: { ...baseDna, order: 3.00002 } }))
    );
  });

  it("rounds rotation values for stable comparison", () => {
    expect(buildRenderCacheKey(makeInput({ rotation: { x: 0.10001, y: 0.2 } }))).toBe(
      buildRenderCacheKey(makeInput({ rotation: { x: 0.10002, y: 0.2 } }))
    );
  });

  it("rounds camera values for stable comparison", () => {
    const a = makeInput({
      camera: { position: { x: 0, y: 0, z: 30.00001 }, quaternion: baseCamera.quaternion },
    });
    const b = makeInput({
      camera: { position: { x: 0, y: 0, z: 30.00002 }, quaternion: baseCamera.quaternion },
    });
    expect(buildRenderCacheKey(a)).toBe(buildRenderCacheKey(b));
  });

  it("different layers → different key", () => {
    expect(buildRenderCacheKey(makeInput({ dna: { ...baseDna, layers: 3 } }))).not.toBe(
      buildRenderCacheKey(makeInput({ dna: { ...baseDna, layers: 4 } }))
    );
  });
});

// ---------------------------------------------------------------------------
// RenderQueue — basic operations
// ---------------------------------------------------------------------------

describe("RenderQueue", () => {
  let queue;

  beforeEach(() => {
    queue = new RenderQueue({ concurrency: 2 });
  });

  describe("basic operations", () => {
    it("runs the render function and resolves with the result", async () => {
      const renderFn = vi.fn(async () => "image-data-url");
      const result = await queue.enqueue("key-1", renderFn);
      expect(result).toBe("image-data-url");
      expect(renderFn).toHaveBeenCalledOnce();
    });

    it("passes an AbortSignal to the render function", async () => {
      const renderFn = vi.fn(async (signal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        return "result";
      });
      await queue.enqueue("key-1", renderFn);
    });

    it("reports size, active, pending correctly", () => {
      const d1 = deferred();
      const d2 = deferred();
      queue.enqueue("a", () => d1.promise);
      queue.enqueue("b", () => d2.promise);
      expect(queue.size).toBe(2);
      expect(queue.active).toBe(2);
      expect(queue.pending).toBe(0);
      d1.resolve("x");
      d2.resolve("y");
    });

    it("has() returns true for active tasks", () => {
      const d = deferred();
      queue.enqueue("key-1", () => d.promise);
      expect(queue.has("key-1")).toBe(true);
      expect(queue.has("key-2")).toBe(false);
      d.resolve("x");
    });

    it("has() returns false after task settles", async () => {
      await queue.enqueue("key-1", async () => "result");
      expect(queue.has("key-1")).toBe(false);
    });

    it("size reaches zero after all tasks settle", async () => {
      await Promise.all([
        queue.enqueue("a", async () => "1"),
        queue.enqueue("b", async () => "2"),
      ]);
      expect(queue.size).toBe(0);
      expect(queue.active).toBe(0);
      expect(queue.pending).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Deduplication — the user specifically wants no double-queuing
  // ---------------------------------------------------------------------------

  describe("deduplication", () => {
    it("returns the same promise when the same key is enqueued twice (in-progress)", () => {
      const d = deferred();
      const renderFn = vi.fn(() => d.promise);
      const p1 = queue.enqueue("key-1", renderFn);
      const p2 = queue.enqueue("key-1", renderFn);
      expect(p1).toBe(p2);
      expect(renderFn).toHaveBeenCalledOnce();
      d.resolve("result");
    });

    it("returns the same promise when the same key is enqueued twice (pending)", () => {
      queue = new RenderQueue({ concurrency: 1 });
      const dActive = deferred();
      queue.enqueue("blocker", () => dActive.promise); // fills the one slot

      const dPending = deferred();
      const fn = vi.fn(() => dPending.promise);
      const p1 = queue.enqueue("dup", fn);
      const p2 = queue.enqueue("dup", fn);
      expect(p1).toBe(p2);
      expect(fn).not.toHaveBeenCalled(); // still pending

      dActive.resolve();
      dPending.resolve("value");
    });

    it("different keys create separate tasks", async () => {
      const fn1 = vi.fn(async () => "result-1");
      const fn2 = vi.fn(async () => "result-2");
      const [r1, r2] = await Promise.all([queue.enqueue("key-1", fn1), queue.enqueue("key-2", fn2)]);
      expect(r1).toBe("result-1");
      expect(r2).toBe("result-2");
      expect(fn1).toHaveBeenCalledOnce();
      expect(fn2).toHaveBeenCalledOnce();
    });

    it("re-enqueue after settlement creates a new task", async () => {
      const fn1 = vi.fn(async () => "result-1");
      const fn2 = vi.fn(async () => "result-2");
      const r1 = await queue.enqueue("key-1", fn1);
      const r2 = await queue.enqueue("key-1", fn2);
      expect(r1).toBe("result-1");
      expect(r2).toBe("result-2");
      expect(fn1).toHaveBeenCalledOnce();
      expect(fn2).toHaveBeenCalledOnce();
    });

    it("re-enqueue after cancellation creates a new task", async () => {
      const d = deferred();
      const fn1 = vi.fn(() => d.promise);
      const p1 = queue.enqueue("key-1", fn1);
      queue.cancel("key-1");
      const r1 = await p1;
      expect(r1).toBeNull();

      const fn2 = vi.fn(async () => "fresh");
      const r2 = await queue.enqueue("key-1", fn2);
      expect(r2).toBe("fresh");
      expect(fn2).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------------
  // Cancellation
  // ---------------------------------------------------------------------------

  describe("cancellation", () => {
    it("cancel() aborts the signal and resolves the promise with null", async () => {
      let capturedSignal;
      const d = deferred();
      const renderFn = vi.fn((signal) => {
        capturedSignal = signal;
        return d.promise;
      });
      const promise = queue.enqueue("key-1", renderFn);
      expect(queue.cancel("key-1")).toBe(true);
      expect(capturedSignal.aborted).toBe(true);
      expect(await promise).toBeNull();
    });

    it("cancel() on unknown key returns false", () => {
      expect(queue.cancel("nonexistent")).toBe(false);
    });

    it("cancel() on already-cancelled key returns false", () => {
      const d = deferred();
      queue.enqueue("key-1", () => d.promise);
      expect(queue.cancel("key-1")).toBe(true);
      expect(queue.cancel("key-1")).toBe(false);
    });

    it("cancel() on a pending (not yet started) task resolves with null", async () => {
      queue = new RenderQueue({ concurrency: 1 });
      const dBlocker = deferred();
      queue.enqueue("blocker", () => dBlocker.promise);

      const fn = vi.fn(async () => "should-not-run");
      const p = queue.enqueue("pending-key", fn);
      expect(queue.pending).toBe(1);

      queue.cancel("pending-key");
      expect(await p).toBeNull();
      expect(fn).not.toHaveBeenCalled();
      dBlocker.resolve();
    });

    it("cancelAll() aborts all active tasks and resolves pending with null", async () => {
      queue = new RenderQueue({ concurrency: 1 });
      const signals = [];
      const d1 = deferred();
      const p1 = queue.enqueue("key-1", (signal) => {
        signals.push(signal);
        return d1.promise;
      });
      const p2 = queue.enqueue("key-2", (signal) => {
        signals.push(signal);
        return deferred().promise;
      });
      const p3 = queue.enqueue("key-3", (signal) => {
        signals.push(signal);
        return deferred().promise;
      });

      expect(queue.active).toBe(1);
      expect(queue.pending).toBe(2);

      queue.cancelAll();
      expect(queue.size).toBe(0);

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBeNull();
      expect(r2).toBeNull();
      expect(r3).toBeNull();
      // Only the active task's signal was created
      expect(signals).toHaveLength(1);
      expect(signals[0].aborted).toBe(true);
    });

    it("cancel() of active task flushes pending tasks into active slots", async () => {
      queue = new RenderQueue({ concurrency: 1 });
      const d1 = deferred();
      const fn2 = vi.fn(async () => "result-2");

      queue.enqueue("key-1", () => d1.promise);
      const p2 = queue.enqueue("key-2", fn2);
      expect(queue.active).toBe(1);
      expect(queue.pending).toBe(1);
      expect(fn2).not.toHaveBeenCalled();

      queue.cancel("key-1");
      const r2 = await p2;
      expect(r2).toBe("result-2");
      expect(fn2).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrency
  // ---------------------------------------------------------------------------

  describe("concurrency", () => {
    it("limits concurrent tasks to the configured maximum", () => {
      queue = new RenderQueue({ concurrency: 2 });
      const fns = [vi.fn(() => deferred().promise), vi.fn(() => deferred().promise), vi.fn(() => deferred().promise)];
      fns.forEach((fn, i) => queue.enqueue(`key-${i}`, fn));

      expect(fns[0]).toHaveBeenCalledOnce();
      expect(fns[1]).toHaveBeenCalledOnce();
      expect(fns[2]).not.toHaveBeenCalled();
      expect(queue.active).toBe(2);
      expect(queue.pending).toBe(1);
    });

    it("promotes pending task when an active task completes", async () => {
      queue = new RenderQueue({ concurrency: 1 });
      const d1 = deferred();
      const fn2 = vi.fn(async () => "result-2");

      queue.enqueue("key-1", () => d1.promise);
      const p2 = queue.enqueue("key-2", fn2);
      expect(fn2).not.toHaveBeenCalled();

      d1.resolve("result-1");
      // let microtasks settle so #run finishes and calls #flush
      await Promise.resolve();
      const r2 = await p2;
      expect(fn2).toHaveBeenCalledOnce();
      expect(r2).toBe("result-2");
    });

    it("promotes pending task when an active task fails", async () => {
      queue = new RenderQueue({ concurrency: 1 });
      const d1 = deferred();
      const fn2 = vi.fn(async () => "result-2");

      const p1 = queue.enqueue("key-1", () => d1.promise);
      const p2 = queue.enqueue("key-2", fn2);

      d1.reject(new Error("fail"));
      await expect(p1).rejects.toThrow("fail");
      expect(await p2).toBe("result-2");
    });

    it("concurrency 1 runs tasks sequentially in FIFO order", async () => {
      queue = new RenderQueue({ concurrency: 1 });
      const order = [];
      const d1 = deferred();
      const d2 = deferred();
      const d3 = deferred();

      queue.enqueue("a", async () => {
        order.push("a-start");
        await d1.promise;
        order.push("a-end");
        return "a";
      });
      queue.enqueue("b", async () => {
        order.push("b-start");
        await d2.promise;
        order.push("b-end");
        return "b";
      });
      queue.enqueue("c", async () => {
        order.push("c-start");
        await d3.promise;
        order.push("c-end");
        return "c";
      });

      expect(order).toEqual(["a-start"]);
      d1.resolve();
      await vi.waitFor(() => expect(order).toContain("b-start"));
      d2.resolve();
      await vi.waitFor(() => expect(order).toContain("c-start"));
      d3.resolve();
      await vi.waitFor(() => expect(order).toEqual(["a-start", "a-end", "b-start", "b-end", "c-start", "c-end"]));
    });
  });

  // ---------------------------------------------------------------------------
  // Cache integration
  // ---------------------------------------------------------------------------

  describe("cache integration", () => {
    it("returns cached result without calling render function", async () => {
      const cache = createMockCache();
      cache.store.set("key-1", "cached-image");
      queue = new RenderQueue({ cache, concurrency: 2 });

      const renderFn = vi.fn(async () => "fresh-image");
      const result = await queue.enqueue("key-1", renderFn);
      expect(result).toBe("cached-image");
      expect(renderFn).not.toHaveBeenCalled();
    });

    it("stores render result in cache", async () => {
      const cache = createMockCache();
      queue = new RenderQueue({ cache, concurrency: 2 });

      await queue.enqueue("key-1", async () => "fresh-image");
      expect(cache.set).toHaveBeenCalledWith("key-1", "fresh-image");
      expect(cache.store.get("key-1")).toBe("fresh-image");
    });

    it("does not cache null results", async () => {
      const cache = createMockCache();
      queue = new RenderQueue({ cache, concurrency: 2 });
      await queue.enqueue("key-1", async () => null);
      expect(cache.set).not.toHaveBeenCalled();
    });

    it("does not cache on error", async () => {
      const cache = createMockCache();
      queue = new RenderQueue({ cache, concurrency: 2 });
      try {
        await queue.enqueue("key-1", async () => {
          throw new Error("fail");
        });
      } catch {}
      expect(cache.set).not.toHaveBeenCalled();
    });

    it("second enqueue with same key hits cache from first render", async () => {
      const cache = createMockCache();
      queue = new RenderQueue({ cache, concurrency: 2 });

      const fn1 = vi.fn(async () => "rendered");
      const fn2 = vi.fn(async () => "should-not-run");

      await queue.enqueue("key-1", fn1);
      const r2 = await queue.enqueue("key-1", fn2);
      expect(r2).toBe("rendered");
      expect(fn2).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it("rejects promise when render function throws", async () => {
      await expect(
        queue.enqueue("key-1", async () => {
          throw new Error("render failed");
        })
      ).rejects.toThrow("render failed");
    });

    it("resolves with null on AbortError (not a rejection)", async () => {
      const result = await queue.enqueue("key-1", async () => {
        throw new DOMException("aborted", "AbortError");
      });
      expect(result).toBeNull();
    });

    it("error in one task does not block subsequent tasks", async () => {
      queue = new RenderQueue({ concurrency: 1 });
      const d1 = deferred();
      const fn2 = vi.fn(async () => "result-2");

      const p1 = queue.enqueue("key-1", () => d1.promise);
      const p2 = queue.enqueue("key-2", fn2);

      d1.reject(new Error("fail"));
      await expect(p1).rejects.toThrow("fail");
      expect(await p2).toBe("result-2");
    });

    it("size and active both reach zero after error", async () => {
      try {
        await queue.enqueue("key-1", async () => {
          throw new Error("fail");
        });
      } catch {}
      expect(queue.size).toBe(0);
      expect(queue.active).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // onSettle callback
  // ---------------------------------------------------------------------------

  describe("onSettle callback", () => {
    it("fires with (key, result, null) on success", async () => {
      const onSettle = vi.fn();
      queue = new RenderQueue({ concurrency: 2, onSettle });

      await queue.enqueue("key-1", async () => "image");
      expect(onSettle).toHaveBeenCalledWith("key-1", "image", null);
    });

    it("fires with (key, null, error) on failure", async () => {
      const onSettle = vi.fn();
      queue = new RenderQueue({ concurrency: 2, onSettle });
      const error = new Error("fail");
      try {
        await queue.enqueue("key-1", async () => {
          throw error;
        });
      } catch {}
      expect(onSettle).toHaveBeenCalledWith("key-1", null, error);
    });

    it("does not fire for cancelled tasks", async () => {
      const onSettle = vi.fn();
      queue = new RenderQueue({ concurrency: 2, onSettle });
      const d = deferred();
      const p = queue.enqueue("key-1", () => d.promise);
      queue.cancel("key-1");
      await p;
      expect(onSettle).not.toHaveBeenCalled();
    });

    it("fires with (key, cached, null) on cache hit", async () => {
      const onSettle = vi.fn();
      const cache = createMockCache();
      cache.store.set("key-1", "cached");
      queue = new RenderQueue({ cache, concurrency: 2, onSettle });

      await queue.enqueue("key-1", async () => "fresh");
      expect(onSettle).toHaveBeenCalledWith("key-1", "cached", null);
    });
  });

  // ---------------------------------------------------------------------------
  // Async edge cases (cancellation timing, double-queue races)
  // ---------------------------------------------------------------------------

  describe("async edge cases", () => {
    it("cancel during cache lookup does not proceed to render", async () => {
      const cacheDeferred = deferred();
      const cache = {
        get: vi.fn(() => cacheDeferred.promise),
        set: vi.fn(async () => {}),
      };
      queue = new RenderQueue({ cache, concurrency: 2 });

      const renderFn = vi.fn(async () => "result");
      const p = queue.enqueue("key-1", renderFn);

      // Cancel before cache lookup resolves
      queue.cancel("key-1");
      cacheDeferred.resolve(null);

      expect(await p).toBeNull();
      expect(renderFn).not.toHaveBeenCalled();
    });

    it("cancel during cache lookup when cache would have been a hit", async () => {
      const cacheDeferred = deferred();
      const cache = {
        get: vi.fn(() => cacheDeferred.promise),
        set: vi.fn(async () => {}),
      };
      queue = new RenderQueue({ cache, concurrency: 2 });

      const renderFn = vi.fn(async () => "result");
      const p = queue.enqueue("key-1", renderFn);

      queue.cancel("key-1");
      cacheDeferred.resolve("cached-value");

      expect(await p).toBeNull();
      expect(renderFn).not.toHaveBeenCalled();
    });

    it("enqueue → cancel → re-enqueue same key works correctly", async () => {
      const d = deferred();
      const p1 = queue.enqueue("key-1", () => d.promise);
      queue.cancel("key-1");
      expect(await p1).toBeNull();

      const r2 = await queue.enqueue("key-1", async () => "fresh-result");
      expect(r2).toBe("fresh-result");
    });

    it("rapid enqueue-cancel cycles do not leak tasks", () => {
      for (let i = 0; i < 10; i++) {
        queue.enqueue("rapid-key", () => deferred().promise);
        queue.cancel("rapid-key");
      }
      expect(queue.size).toBe(0);
      expect(queue.active).toBe(0);
    });

    it("cancelAll during mixed pending and active states resolves all with null", async () => {
      queue = new RenderQueue({ concurrency: 1 });
      const d1 = deferred();
      const p1 = queue.enqueue("key-1", () => d1.promise);
      const p2 = queue.enqueue("key-2", () => deferred().promise);
      const p3 = queue.enqueue("key-3", () => deferred().promise);

      expect(queue.active).toBe(1);
      expect(queue.pending).toBe(2);

      queue.cancelAll();
      expect(queue.size).toBe(0);

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBeNull();
      expect(r2).toBeNull();
      expect(r3).toBeNull();
    });

    it("enqueue while another task for same key is settling does not double-queue", async () => {
      let callCount = 0;
      const d = deferred();
      const fn = vi.fn(() => {
        callCount++;
        return d.promise;
      });

      const p1 = queue.enqueue("key-1", fn);
      const p2 = queue.enqueue("key-1", fn);
      expect(p1).toBe(p2);
      expect(callCount).toBe(1);

      d.resolve("result");
      expect(await p1).toBe("result");
    });

    it("concurrent enqueue of many keys respects concurrency limit throughout", async () => {
      queue = new RenderQueue({ concurrency: 2 });
      const deferreds = Array.from({ length: 5 }, () => deferred());
      const started = [];

      const promises = deferreds.map((d, i) =>
        queue.enqueue(`key-${i}`, async () => {
          started.push(i);
          return d.promise;
        })
      );

      // Only 2 should have started
      expect(started).toEqual([0, 1]);
      expect(queue.active).toBe(2);
      expect(queue.pending).toBe(3);

      // Complete first task
      deferreds[0].resolve("r0");
      await promises[0];
      await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));

      // Complete second task
      deferreds[1].resolve("r1");
      await promises[1];
      await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]));

      // Complete remaining
      deferreds[2].resolve("r2");
      deferreds[3].resolve("r3");
      deferreds[4].resolve("r4");
      const results = await Promise.all(promises);
      expect(results).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    });

    it("cancel of task whose renderFn resolves after cancellation discards result", async () => {
      const d = deferred();
      const p = queue.enqueue("key-1", () => d.promise);
      queue.cancel("key-1");

      // Render function completes after cancel
      d.resolve("late-result");
      expect(await p).toBeNull();
      // Size should still be 0
      expect(queue.size).toBe(0);
    });
  });
});
