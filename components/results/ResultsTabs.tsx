"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TabSpec {
  /** The section id the tab always had ("worth-it"): the URL hash that opens it, and the id of its panel. */
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * The tab ids the URL hash can open, and the one open now. The hash is read when the page loads and whenever it changes (an
 * old link, or a link inside the page); choosing a tab writes it back without adding a history entry.
 */
export function useTabState(ids: readonly string[], fallback: string) {
  const [active, setActive] = useState(fallback);
  const known = ids.join("|");
  const arrived = useRef(false);

  useEffect(() => {
    const open = (first: boolean) => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!known.split("|").includes(id)) return;
      setActive(id);
      // Following a link to a tab on a phone: the face is on top and the panel under the fold, so bring the tab row up.
      if (first && !arrived.current && !window.matchMedia("(min-width: 1024px)").matches) {
        window.setTimeout(() => {
          const row = document.getElementById(`tab-${id}`)?.parentElement?.parentElement;
          if (row) window.scrollTo({ top: row.getBoundingClientRect().top + window.scrollY, behavior: "instant" });
        }, 50);
      }
    };
    open(true);
    arrived.current = true;
    const onChange = () => open(false);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, [known]);

  const select = useCallback((id: string) => {
    setActive(id);
    if (window.location.hash !== `#${id}`) window.history.replaceState(null, "", `#${id}`);
  }, []);

  return [ids.includes(active) ? active : fallback, select] as const;
}

interface ResultsTabsProps {
  tabs: TabSpec[];
  active: string;
  onChange: (id: string) => void;
  /** Names the tab list for assistive tech. */
  label: string;
}

/**
 * A WAI-ARIA tablist: the arrow keys, Home and End move between tabs (the tab in focus is the open one), and only the open tab
 * is in the tab order. A panel is built the first time its tab is opened and then kept, so what is in progress in one (a plan
 * being written, a choice made) is still there when you come back.
 */
export function ResultsTabs({ tabs, active, onChange, label }: ResultsTabsProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const panels = useRef(new Map<string, HTMLDivElement>());
  const list = useRef<HTMLDivElement>(null);
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([active]));
  if (!visited.has(active)) setVisited(new Set([...visited, active]));
  const settled = useRef(false);

  // Keep the open tab in sight when the row scrolls sideways (phones, narrow desktops).
  useEffect(() => {
    const button = buttons.current.get(active);
    const row = list.current;
    if (!button || !row || row.scrollWidth <= row.clientWidth) return;
    const left = button.offsetLeft - 16;
    const right = button.offsetLeft + button.offsetWidth + 16;
    if (left < row.scrollLeft) row.scrollLeft = Math.max(0, left);
    else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth;
  }, [active]);

  // When a tab is chosen from far down the page, start the new panel at its top instead of leaving the reader in the middle of a
  // different, shorter one. Beside the face that means the top of the page (the face is in view there); on a phone, the panel's
  // head just under the tab row.
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    const row = list.current?.parentElement;
    const panel = panels.current.get(active);
    if (!row || !panel) return;
    if (window.matchMedia("(min-width: 1024px)").matches) {
      if (window.scrollY > 64) window.scrollTo({ top: 0, behavior: "instant" });
    } else if (row.getBoundingClientRect().top <= 1) {
      const gap = panel.getBoundingClientRect().top - row.getBoundingClientRect().bottom;
      window.scrollBy({ top: gap - 8, behavior: "instant" });
    }
  }, [active]);

  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    buttons.current.get(tabs[next].id)?.focus();
  };

  return (
    <div>
      <div className="sticky top-0 z-30 -mx-5 border-b border-ink bg-paper px-5 sm:-mx-[clamp(1.25rem,4vw,3.5rem)] sm:px-[clamp(1.25rem,4vw,3.5rem)] lg:mx-0 lg:px-0">
        <div ref={list} role="tablist" aria-label={label} aria-orientation="horizontal" onKeyDown={move} className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  if (el) buttons.current.set(t.id, el);
                  else buttons.current.delete(t.id);
                }}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={t.id}
                tabIndex={on ? 0 : -1}
                onClick={() => onChange(t.id)}
                className={`relative min-h-12 shrink-0 whitespace-nowrap px-4 text-[0.9375rem] leading-none transition-colors first:pl-0 lg:first:pl-0 ${on ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}
              >
                {t.label}
                <span aria-hidden="true" className={`absolute inset-x-4 bottom-0 h-0.5 bg-ink first:inset-x-0 ${on ? "" : "scale-x-0"} transition-transform duration-200 forced-colors:bg-[CanvasText]`} />
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((t) => (
        <div
          key={t.id}
          ref={(el) => {
            if (el) panels.current.set(t.id, el);
            else panels.current.delete(t.id);
          }}
          id={t.id}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          className="pt-4 outline-none"
        >
          {visited.has(t.id) ? t.content : null}
        </div>
      ))}
    </div>
  );
}
