"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Wordmark } from "./Wordmark";

const NAV = [
  { href: "/try", label: "Try it" },
  { href: "/self-test", label: "Self-test" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/science", label: "The science" },
  { href: "/for-brands", label: "For brands" },
] as const;

/** Header shell shown while the pathname-aware version streams in. */
export function SiteHeaderStatic() {
  return (
    <header className="border-b border-rule">
      <div className="page flex h-16 items-center justify-between">
        <Wordmark />
      </div>
    </header>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="relative border-b border-rule">
      <div className="page flex h-16 items-center justify-between">
        <Wordmark />

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-8 text-[0.9375rem]">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className={`link py-2 ${isCurrent(item.href) ? "text-ink" : "text-muted hover:text-ink"}`}
                  style={isCurrent(item.href) ? { backgroundSize: "100% 1px" } : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <button
          ref={buttonRef}
          type="button"
          className="-mr-2 inline-flex h-11 items-center gap-2 px-2 text-[0.9375rem] md:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open ? "Close" : "Menu"}</span>
          <svg width="18" height="10" viewBox="0 0 18 10" fill="none" aria-hidden="true">
            <path d={open ? "M2 1l14 8M16 1L2 9" : "M0 1h18M0 9h18"} stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>

      <nav
        id={panelId}
        aria-label="Main"
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-b border-rule bg-paper md:hidden"
      >
        <ul className="page flex flex-col py-2">
          {NAV.map((item) => (
            <li key={item.href} className="border-t border-rule first:border-t-0">
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isCurrent(item.href) ? "page" : undefined}
                className="serif flex min-h-14 items-center justify-between text-[1.5rem]"
              >
                {item.label}
                <span aria-hidden="true" className="text-muted">
                  &rarr;
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
