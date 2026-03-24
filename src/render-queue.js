/**
 * Round a numeric value for use in cache keys, collapsing tiny
 * floating-point differences into the same bucket.
 */
export function roundForCacheKey(value, precision = 4) {
  return Number(value.toFixed(precision));
}

/**
 * Build a deterministic, JSON-serialised cache key from every variable that
 * affects the final rendered image.  Mode-agnostic — callers supply the
 * concrete values; the function only serialises and rounds.
 *
 * @param {{ style: string, source: string, dna: object, rotation: {x:number,y:number}, camera: {position:{x,y,z}, quaternion:{x,y,z,w}} }} params
 * @returns {string}
 */
export function buildRenderCacheKey({ style, source, dna, rotation, camera }) {
  return JSON.stringify({
    style,
    source,
    dna: {
      order: roundForCacheKey(dna.order),
      warp: roundForCacheKey(dna.warp),
      fold: roundForCacheKey(dna.fold),
      spike: roundForCacheKey(dna.spike),
      chaos: roundForCacheKey(dna.chaos),
      layers: dna.layers,
    },
    rotation: {
      x: roundForCacheKey(rotation.x),
      y: roundForCacheKey(rotation.y),
    },
    camera: {
      position: {
        x: roundForCacheKey(camera.position.x),
        y: roundForCacheKey(camera.position.y),
        z: roundForCacheKey(camera.position.z),
      },
      quaternion: {
        x: roundForCacheKey(camera.quaternion.x),
        y: roundForCacheKey(camera.quaternion.y),
        z: roundForCacheKey(camera.quaternion.z),
        w: roundForCacheKey(camera.quaternion.w),
      },
    },
  });
}

// ── Task lifecycle ──────────────────────────────────────────────────────────

const PENDING = "pending";
const ACTIVE = "active";
const CANCELLED = "cancelled";

/**
 * Generic pre-rendering queue with caching, concurrency control, deduplication,
 * and AbortController-based cancellation.
 *
 * Mode-agnostic: demo, preview, and manual modes all submit tasks through the
 * same interface.  Each task is identified by its cache key — duplicate
 * enqueue calls for a key that is still pending or active return the existing
 * promise instead of launching a second request.
 *
 * @param {object}  options
 * @param {object}  [options.cache]        – async { get(key)→value|null, set(key,value) }
 * @param {number}  [options.concurrency]  – max simultaneous active tasks (default 2)
 * @param {function} [options.onSettle]    – callback(key, result, error) after each settlement
 */
export class RenderQueue {
  #tasks = new Map(); // key → task  (only pending + active entries live here)
  #cache;
  #concurrency;
  #activeCount = 0;
  #onSettle;

  constructor({ cache = null, concurrency = 2, onSettle = null } = {}) {
    this.#cache = cache;
    this.#concurrency = concurrency;
    this.#onSettle = onSettle;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Submit a render task.  If a task with the same key is already pending or
   * active the existing promise is returned (no duplicate work).
   *
   * @param {string}   key       – cache key (use buildRenderCacheKey)
   * @param {function} renderFn  – (signal: AbortSignal) => Promise<string|null>
   * @returns {Promise<string|null>}
   */
  enqueue(key, renderFn) {
    const existing = this.#tasks.get(key);
    if (existing) return existing.promise;

    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const task = {
      key,
      status: PENDING,
      renderFn,
      resolve,
      reject,
      promise,
      abortController: null,
    };

    this.#tasks.set(key, task);
    this.#flush();
    return promise;
  }

  /**
   * Cancel a single task.  If active its AbortController is triggered;
   * if pending it is simply removed.  The task's promise resolves with null.
   *
   * @param {string} key
   * @returns {boolean} true if a task was found and cancelled
   */
  cancel(key) {
    const task = this.#tasks.get(key);
    if (!task) return false;

    const wasActive = task.status === ACTIVE;
    task.status = CANCELLED;

    if (task.abortController) {
      task.abortController.abort();
      task.abortController = null;
    }

    task.resolve(null);
    this.#tasks.delete(key);

    if (wasActive) {
      this.#activeCount--;
      this.#flush();
    }

    return true;
  }

  /**
   * Cancel every pending and active task.
   */
  cancelAll() {
    for (const task of this.#tasks.values()) {
      task.status = CANCELLED;
      if (task.abortController) {
        task.abortController.abort();
        task.abortController = null;
      }
      task.resolve(null);
    }
    this.#activeCount = 0;
    this.#tasks.clear();
  }

  /**
   * Whether a task with the given key is pending or active.
   */
  has(key) {
    return this.#tasks.has(key);
  }

  /** Number of pending (not yet started) tasks. */
  get pending() {
    let n = 0;
    for (const t of this.#tasks.values()) if (t.status === PENDING) n++;
    return n;
  }

  /** Number of currently-running tasks. */
  get active() {
    return this.#activeCount;
  }

  /** Total tasks that are pending or active. */
  get size() {
    return this.#tasks.size;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /** Promote pending tasks into active slots up to the concurrency limit. */
  #flush() {
    for (const task of this.#tasks.values()) {
      if (this.#activeCount >= this.#concurrency) break;
      if (task.status !== PENDING) continue;
      this.#run(task);
    }
  }

  /** Execute a single task through cache-check → render → settle. */
  async #run(task) {
    task.status = ACTIVE;
    task.abortController = new AbortController();
    this.#activeCount++;

    try {
      // ── 1. Cache lookup ──────────────────────────────────────────────
      if (this.#cache) {
        const cached = await this.#cache.get(task.key);
        if (task.status === CANCELLED) return;
        if (cached != null) {
          this.#settle(task, cached, null);
          return;
        }
      }

      if (task.status === CANCELLED) return;

      // ── 2. Run the render function ───────────────────────────────────
      const result = await task.renderFn(task.abortController.signal);
      if (task.status === CANCELLED) return;

      // ── 3. Persist to cache ──────────────────────────────────────────
      if (this.#cache && result != null) {
        await this.#cache.set(task.key, result);
      }

      this.#settle(task, result, null);
    } catch (error) {
      if (task.status === CANCELLED) return;

      if (error instanceof DOMException && error.name === "AbortError") {
        this.#settle(task, null, null);
      } else {
        this.#settleWithError(task, error);
      }
    }
  }

  /** Successful (or AbortError) settlement. */
  #settle(task, result, error) {
    this.#activeCount--;
    task.abortController = null;
    this.#tasks.delete(task.key);
    task.resolve(result);
    this.#onSettle?.(task.key, result, error);
    this.#flush();
  }

  /** Error settlement. */
  #settleWithError(task, error) {
    this.#activeCount--;
    task.abortController = null;
    this.#tasks.delete(task.key);
    task.reject(error);
    this.#onSettle?.(task.key, null, error);
    this.#flush();
  }
}
