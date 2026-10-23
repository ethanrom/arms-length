/**
 * Renders for moments that are not on screen yet start one at a time, after the page is idle, so the visible moment's
 * render is never queued behind them in the render worker (which takes jobs in order).
 */
export interface Ticket {
  /** The task is finished (or its owner went away): let the next one start. Safe to call more than once. */
  release(): void;
  /** Leave the queue without starting. */
  cancel(): void;
}

interface Entry {
  start: () => void;
  state: "waiting" | "running" | "finished";
  timer?: ReturnType<typeof setTimeout>;
}

export class LaterQueue {
  private readonly waiting: Entry[] = [];
  private running = 0;
  private pumping = false;

  constructor(
    /** Calls `fn` once the page can spare the time. */
    private readonly whenIdle: (fn: () => void) => void,
    /** A task that never reports back is released after this long. */
    private readonly stuckAfterMs = 6000,
  ) {}

  enqueue(start: () => void): Ticket {
    const entry: Entry = { start, state: "waiting" };
    this.waiting.push(entry);
    this.pump();
    const release = () => {
      if (entry.state === "running") this.running--;
      if (entry.timer) clearTimeout(entry.timer);
      const wasWaiting = entry.state === "waiting";
      entry.state = "finished";
      if (wasWaiting) this.waiting.splice(this.waiting.indexOf(entry), 1);
      this.pump();
    };
    return { release, cancel: release };
  }

  private pump(): void {
    if (this.pumping || this.running > 0 || this.waiting.length === 0) return;
    this.pumping = true;
    this.whenIdle(() => {
      this.pumping = false;
      if (this.running > 0) return;
      const next = this.waiting.shift();
      if (!next) return;
      next.state = "running";
      this.running++;
      next.timer = setTimeout(() => {
        if (next.state === "running") {
          next.state = "finished";
          this.running--;
          this.pump();
        }
      }, this.stuckAfterMs);
      next.start();
    });
  }
}

/** The browser's idle time, with a timeout so a busy page still gets its renders, and a fallback where it is missing. */
export function browserIdle(fn: () => void): void {
  if (typeof requestIdleCallback === "function") requestIdleCallback(() => fn(), { timeout: 800 });
  else setTimeout(fn, 150);
}

export const laterQueue = new LaterQueue(browserIdle);
