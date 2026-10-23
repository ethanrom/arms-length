"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScaleEstimate } from "@/lib/contracts";
import type { DayPlan, ObserveResult, RehearsePrefs, RehearseRequest, SceneInput } from "@/lib/contracts/rehearse";
import { AskForm } from "./AskForm";
import { PlanView } from "./PlanView";
import { Progress } from "./Progress";
import { streamRehearse, type ErrorEvent } from "./stream";

export interface RehearseDayProps {
  requestFace: RehearseRequest["face"];
  photo: { src: string; alt: string; frame: { width: number; height: number }; scale: ScaleEstimate };
  /** Recomputes a moment for an edited light, viewer or distance, with the model that built the plan. Without it, moments can't be edited. */
  rerun?: (input: SceneInput, ref: string) => ObserveResult;
  /** A card was chosen: the page moves its Step back view to this distance (metres). */
  onSelectMoment?: (distanceM: number) => void;
}

/** Kind sentences for each way a run can end without a plan. */
const MESSAGES: Record<ErrorEvent["code"], string> = {
  disabled: "Rehearsing a day isn't switched on here right now. The rest of the page works as it did.",
  kill_switch: "Rehearsing a day is paused for a little while. The rest of the page works as it did.",
  rate_limited: "That is a lot of rehearsals for now. Please try again a little later.",
  bad_request: "That day couldn't be read. A few plain words about where you will be, and when, usually do it.",
  too_large: "That is a long day. Try a shorter description, a few lines at most.",
  unknown_face: "This face isn't available for rehearsals. Pick one of the demo faces, or run a new reading.",
  upstream: "The planner couldn't be reached just now, and nothing was lost. Please try again in a moment.",
  timeout: "That took longer than expected. Try again, or describe a little less of the day.",
};

interface Run {
  kind: "ask" | "follow";
  steps: string[];
}

/**
 * "Rehearse your day": describe a day, and each moment of it comes back with your face as the people there will see it.
 * Everything numeric arrives checked from /api/rehearse; this component only asks, shows progress and lays the plan out.
 */
export function RehearseDay({ requestFace, photo, rerun, onSelectMoment }: RehearseDayProps) {
  const { src, alt, frame, scale } = photo;
  const { width, height } = frame;
  const { mmPerPx, relSd, source, irisPx } = scale;
  // The renderer restarts when these change identity, so the photo is rebuilt only when a value does.
  const stable = useMemo(
    () => ({ src, alt, frame: { width, height }, scale: { mmPerPx, relSd, source, ...(irisPx === undefined ? {} : { irisPx }) } }),
    [src, alt, width, height, mmPerPx, relSd, source, irisPx],
  );

  const [prefs, setPrefs] = useState<RehearsePrefs>({ callDevice: "laptop", noMakeup: false });
  const [current, setCurrent] = useState<{ plan: DayPlan; key: number; steps: string[] } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<{ kind: Run["kind"]; text: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const planRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // A new plan is the answer the visitor is waiting for: bring it into view and let a screen reader announce it.
  const planKey = current?.key;
  useEffect(() => {
    if (planKey) planRef.current?.focus();
  }, [planKey]);

  const start = useCallback(
    async (kind: Run["kind"], day: string, followUp?: NonNullable<RehearseRequest["followUp"]>) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const steps = [kind === "ask" ? "Reading your day" : "Reading your question"];
      setError(null);
      setRun({ kind, steps });

      const request: RehearseRequest = { face: requestFace, day, prefs, ...(followUp ? { followUp } : {}) };
      try {
        const end = await streamRehearse(
          request,
          (event) => {
            if (event.type !== "step") return;
            steps.push(event.label);
            setRun({ kind, steps: [...steps] });
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (end.type === "plan") setCurrent((c) => ({ plan: end.plan, key: (c?.key ?? 0) + 1, steps: [...steps] }));
        else setError({ kind, text: MESSAGES[end.code] ?? MESSAGES.upstream });
      } catch {
        // aborted by a newer run or by leaving the page: nothing to show
      } finally {
        if (abort.current === controller) {
          abort.current = null;
          setRun(null);
        }
      }
    },
    [requestFace, prefs],
  );

  const asking = run?.kind === "ask";
  const following = run?.kind === "follow";

  return (
    <div>
      <AskForm busy={!!run} prefs={prefs} onPrefs={setPrefs} onSubmit={(day) => start("ask", day)} />

      {asking && (
        <div className="mt-10 max-w-xl">
          <Progress steps={run.steps} active label="Progress" />
        </div>
      )}
      {error?.kind === "ask" && (
        <p role="alert" data-testid="rehearse-error" className="mt-8 max-w-xl border-l-2 border-ink pl-4 text-[1rem] leading-relaxed">
          {error.text}
        </p>
      )}

      {current && (
        <div className="mt-14 md:mt-16">
          <PlanView
            key={current.key}
            ref={planRef}
            plan={current.plan}
            photo={stable}
            steps={current.steps}
            rerun={rerun}
            onSelectMoment={onSelectMoment}
            onFollowUp={(question) => start("follow", current.plan.day, { question, previous: current.plan })}
            followUp={{ busy: following, error: error?.kind === "follow" ? error.text : null }}
            progress={following ? <Progress steps={run.steps} active label="Progress on your question" /> : undefined}
          />
        </div>
      )}
    </div>
  );
}
