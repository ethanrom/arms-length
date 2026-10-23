"use client";

import { useEffect, useRef, useState } from "react";
import { loopTab } from "./focus";
import type { DayPlan, PlannedMoment } from "@/lib/contracts/rehearse";
import { SCENE_FOV_DEG } from "./stage/pov";
import { HowWeKnow } from "./HowWeKnow";

interface DrawerProps {
  plan: DayPlan;
  moment: PlannedMoment;
  onClose: () => void;
}

/**
 * "How we know": what the picture rests on, in the order a sceptic asks. The sentences the planner wrote for this moment, the
 * assumptions and receipts behind them, and how the scene around the face is drawn (a stated assumption, not a measurement).
 */
export function Drawer({ plan, moment, onClose }: DrawerProps) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);
  // Esc closes the drawer first; the capture phase gets there before the dialog's own Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const call = moment.scene.scene === "video_call";

  return (
    <section
      ref={root}
      onKeyDown={(e) => {
        // The drawer is its own trap: the page behind it, and the dialog's cross, are out of reach while it is open.
        if (root.current && loopTab(e, root.current)) e.stopPropagation();
      }}
      aria-labelledby="rehearse-know-title"
      data-testid="rehearse-drawer"
      className={`absolute inset-y-0 right-0 z-20 flex w-[min(30rem,100%)] flex-col border-l border-ink bg-paper transition-transform duration-300 ease-out ${shown ? "translate-x-0" : "translate-x-full"}`}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-rule px-6 py-5">
        <div>
          <h2 id="rehearse-know-title" ref={heading} tabIndex={-1} className="serif text-[1.75rem] leading-tight outline-none" style={{ fontWeight: 380 }}>
            How we know
          </h2>
          <p className="mt-1 text-[0.9375rem] text-ink-soft">
            {moment.time ? `${moment.time} · ` : ""}
            {moment.title}
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm shrink-0">
          Close
        </button>
      </header>

      <div role="region" aria-label="The details" tabIndex={0} className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-6 text-[0.9375rem] leading-relaxed">
        <section>
          <h3 className="eyebrow">What the plan says</h3>
          <ul className="mt-3 space-y-2">
            {[...moment.notice, ...moment.outOfSight, moment.action.claim].map((c) => (
              <li key={c.text} className="border-l-2 border-rule pl-3">
                {c.text}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="eyebrow">What it rests on</h3>
          <div className="mt-3">
            <HowWeKnow plan={plan} moment={moment} />
          </div>
        </section>

        <section>
          <h3 className="eyebrow">How the picture is drawn</h3>
          <p className="mt-3 text-ink-soft">
            {call
              ? "On a call, the scene is the other person's laptop screen, about 19 cm tall. Your picture is your camera's view of you, fitted to the tile you fill on that screen and softened to what the video can carry."
              : `The scene is a ${SCENE_FOV_DEG}° window onto the room, the middle of what a viewer takes in at once. That is a project assumption, not a measurement. Your face is drawn at its true size for the distance, from the scale of your photo.`}
          </p>
          <p className="mt-3 text-ink-soft">The softening of your face is the model that also drives the Step back slider. The props around it are drawn for company, not measured.</p>
        </section>
      </div>
    </section>
  );
}
