"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DayPlan, RehearsePrefs, RehearseRequest } from "@/lib/contracts/rehearse";
import { Ask } from "./Ask";
import { Building, type SketchPanel } from "./Building";
import { Day } from "./Day";
import { ExperienceDialog } from "./ExperienceDialog";
import type { StagePhoto } from "./stage/types";
import { streamRehearse, type ErrorEvent } from "./stream";
import { Teaser } from "./Teaser";
import { useCalm } from "./useCalm";

export interface RehearseDayProps {
  requestFace: RehearseRequest["face"];
  /** The face as the stage draws it. `focus` is the cheek and nose patch the Step back loupe magnifies (frame px). */
  photo: StagePhoto;
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

/** How long the faces take to arrive in the sketches before the day opens. */
const LANDING_MS = 1500;

interface Run {
  kind: "ask" | "follow";
  status: string;
  panels: SketchPanel[];
  landed: DayPlan | null;
}

/**
 * "Tomorrow, from their side". On the page it is a teaser with one button; the button opens a full-screen experience: ask, the
 * storyboard sketching itself while the agent works, then the day, one moment at a time. Everything numeric arrives checked from
 * /api/rehearse; this only asks, shows progress and lays the plan out.
 */
export function RehearseDay({ requestFace, photo }: RehearseDayProps) {
  const { src, alt, frame, scale, focus } = photo;
  const { width, height } = frame;
  const { mmPerPx, relSd, source, irisPx } = scale;
  const [fx, fy, fw, fh] = focus ? [focus.x, focus.y, focus.w, focus.h] : [];
  // The renderer restarts when these change identity, so the photo is rebuilt only when a value does.
  const stable = useMemo<StagePhoto>(
    () => ({
      src,
      alt,
      frame: { width, height },
      scale: { mmPerPx, relSd, source, ...(irisPx === undefined ? {} : { irisPx }) },
      ...(fx === undefined || fy === undefined || fw === undefined || fh === undefined ? {} : { focus: { x: fx, y: fy, w: fw, h: fh } }),
    }),
    [src, alt, width, height, mmPerPx, relSd, source, irisPx, fx, fy, fw, fh],
  );

  const calm = useCalm();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"ask" | "day">("ask");
  const [draft, setDraft] = useState("");
  const [prefs, setPrefs] = useState<RehearsePrefs>({ callDevice: "laptop", noMakeup: false });
  const [current, setCurrent] = useState<{ plan: DayPlan; key: number } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<{ kind: Run["kind"]; text: string } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(
    async (kind: Run["kind"], day: string, followUp?: NonNullable<RehearseRequest["followUp"]>) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const panels: SketchPanel[] = [];
      let status = kind === "ask" ? "Reading your day." : "Reading your question.";
      setError(null);
      setRun({ kind, status, panels: [], landed: null });

      const request: RehearseRequest = { face: requestFace, day, prefs, ...(followUp ? { followUp } : {}) };
      try {
        const end = await streamRehearse(
          request,
          (event) => {
            if (event.type !== "step") return;
            status = event.label;
            const found = event.moment;
            if (found && !panels.some((p) => p.title === found.title)) panels.push({ key: `${panels.length}`, title: found.title, scene: found.scene });
            setRun({ kind, status, panels: [...panels], landed: null });
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (end.type === "error") {
          setError({ kind, text: MESSAGES[end.code] ?? MESSAGES.upstream });
          return;
        }
        // The plan is in: let your face arrive in each sketch before the day opens.
        setRun({ kind, status, panels: [...panels], landed: end.plan });
        await new Promise((resolve) => window.setTimeout(resolve, calm ? 0 : LANDING_MS));
        if (controller.signal.aborted) return;
        setCurrent((c) => ({ plan: end.plan, key: (c?.key ?? 0) + 1 }));
        setView("day");
      } catch {
        // aborted by a newer run or by leaving the page: nothing to show
      } finally {
        if (abort.current === controller) {
          abort.current = null;
          setRun(null);
        }
      }
    },
    [requestFace, prefs, calm],
  );

  const close = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setRun(null);
    setOpen(false);
  }, []);

  const openIt = () => {
    setError(null);
    setView(current ? "day" : "ask");
    setOpen(true);
  };

  const followFailed = error?.kind === "follow";
  const focusKey = run ? `building-${run.kind}` : view === "day" && current ? `day-${current.key}` : "ask";

  return (
    <div>
      <Teaser photo={stable} onOpen={openIt} />

      {open && (
        <ExperienceDialog onClose={close} focusKey={focusKey}>
          {run ? (
            <Building photo={stable} panels={run.panels} status={run.status} landed={run.landed} />
          ) : view === "day" && current ? (
            <Day
              key={current.key}
              plan={current.plan}
              photo={stable}
              startKey={current.key}
              startAtEnd={followFailed}
              onFollowUp={(question) => start("follow", current.plan.day, { question, previous: current.plan })}
              followUpError={followFailed ? error.text : null}
              onStartOver={() => {
                setError(null);
                setDraft(current.plan.day);
                setCurrent(null);
                setView("ask");
              }}
              onClose={close}
            />
          ) : (
            <Ask prefs={prefs} onPrefs={setPrefs} onSubmit={(day) => start("ask", day)} error={error?.kind === "ask" ? error.text : null} day={draft} onDay={setDraft} />
          )}
        </ExperienceDialog>
      )}
    </div>
  );
}
