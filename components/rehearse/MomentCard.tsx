"use client";

import { useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { formatDistance, spokenDistance } from "@/app/_lib/axis";
import type { DayPlan, ObserveResult, PlannedMoment, SceneInput } from "@/lib/contracts/rehearse";
import { Disclosure } from "./Disclosure";
import { EditPanel } from "./EditPanel";
import { editedScene, editedSentences, sameEdit, startingEdit, type MomentEdit } from "./edit";
import { HowWeKnow } from "./HowWeKnow";
import { lightLabel, sceneLabel, viewerShort } from "./labels";
import { observeOf } from "./results";
import { TheirView, type RehearsePhoto } from "./TheirView";

export type Rerun = (input: SceneInput, ref: string) => ObserveResult;

interface MomentCardProps {
  plan: DayPlan;
  moment: PlannedMoment;
  photo: RehearsePhoto;
  rerun?: Rerun;
  onSelectMoment?: (distanceM: number) => void;
}

interface Edited {
  edit: MomentEdit;
  result: ObserveResult;
}

/** Clicks on these keep their own meaning; a click anywhere else on the card moves the Step back view. */
const OWN_CLICK = "button, a, input, select, textarea, summary, label, details";

export function MomentCard({ plan, moment, photo, rerun, onSelectMoment }: MomentCardProps) {
  const base = observeOf(plan, moment);
  const [edited, setEdited] = useState<Edited | null>(null);
  const [failed, setFailed] = useState(false);
  const [said, setSaid] = useState("");
  const runs = useRef(0);
  const ids = { notice: useId(), out: useId(), act: useId(), title: useId() };

  const observe = edited?.result ?? base;
  const start = useMemo(() => (base ? startingEdit(base) : null), [base]);
  const edit = edited?.edit ?? start;
  const distanceM = observe?.distanceM ?? null;

  const sentences = useMemo(() => (edited ? editedSentences(edited.result) : null), [edited]);
  const notice = sentences ? sentences.notice : moment.notice.map((c) => c.text);
  const outOfSight = sentences ? sentences.outOfSight : moment.outOfSight.map((c) => c.text);

  const reset = () => {
    setEdited(null);
    setFailed(false);
  };
  const apply = (next: MomentEdit) => {
    if (!rerun || !base || !start) return;
    if (sameEdit(next, start)) return reset();
    try {
      runs.current += 1;
      const result = rerun(editedScene(moment, next), `edit:${moment.id}:${runs.current}`);
      setEdited({ edit: next, result });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const select = () => {
    if (!onSelectMoment || distanceM === null) return;
    onSelectMoment(distanceM);
    setSaid(`The Step back slider is now at ${spokenDistance(distanceM)}.`);
  };
  const onCardClick = (e: MouseEvent<HTMLElement>) => {
    if (!(e.target as HTMLElement).closest(OWN_CLICK)) select();
  };

  return (
    // The card's click is a convenience for the pointer; the keyboard has the "Step back" button, so no role is needed here.
    <article
      aria-labelledby={ids.title}
      data-testid="moment-card"
      onClick={onSelectMoment ? onCardClick : undefined}
      className={`grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 border-t border-ink py-6 md:grid-cols-[10.5rem_minmax(0,1fr)] md:gap-x-8 md:py-8 ${onSelectMoment ? "cursor-pointer" : ""}`}
    >
      <div className="md:row-span-3">{observe && <TheirView photo={photo} observe={observe} />}</div>

      <header className="min-w-0">
        {moment.time && <p className="eyebrow !text-[0.875rem]">{moment.time}</p>}
        <h4 id={ids.title} className="serif mt-1 text-[clamp(1.375rem,1.1rem+1.1vw,1.875rem)] leading-tight" style={{ fontWeight: 400 }}>
          {moment.title}
        </h4>
        {observe && <SceneChips observe={observe} />}
        {onSelectMoment && distanceM !== null && (
          <button type="button" onClick={select} className="btn btn-ghost btn-sm mt-3">
            <span aria-hidden="true">&uarr;</span> Step back to {formatDistance(distanceM)}
          </button>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {said}
        </p>
      </header>

      <div className="col-span-2 mt-6 md:col-span-1 md:col-start-2 md:mt-5">
        {edited && (
          <p data-testid="edited-note" className="mb-5 border-l-2 border-ink pl-4 text-[0.9375rem] leading-relaxed text-ink-soft">
            <span className="text-ink">Edited.</span> Numbers from the model, wording by template. The plan&rsquo;s advice for this moment is hidden until you go back to it.{" "}
            <button type="button" className="link text-ink" onClick={reset}>
              Back to the plan
            </button>
          </p>
        )}

        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <Block id={ids.notice} title="They&rsquo;d notice" shape="solid" lines={notice} empty="Nothing stands out from here." />
          <Block id={ids.out} title="Out of sight" shape="hollow" lines={outOfSight} empty="Nothing to list." />
        </div>

        {!edited && (
          <div className="mt-6 border-l-2 border-ink pl-4">
            <h5 id={ids.act} className="eyebrow !text-[0.875rem] !text-ink">
              Do this
            </h5>
            <p className="serif mt-1.5 text-[1.1875rem] leading-snug" style={{ fontWeight: 400 }}>
              {moment.action.claim.text}
            </p>
          </div>
        )}
      </div>

      <div className="col-span-2 mt-5 md:col-span-1 md:col-start-2">
        <Disclosure summary="How we know">{edited ? <EditedKnow observe={edited.result} /> : <HowWeKnow plan={plan} moment={moment} />}</Disclosure>
        {rerun && edit && (
          <Disclosure summary="Change the light, the eyes or the distance" className="border-b">
            <EditPanel scene={moment.scene.scene} edit={edit} onChange={apply} onReset={reset} changed={!!edited} />
            {failed && (
              <p role="alert" className="mt-4 text-[0.9375rem] text-ink-soft">
                That combination couldn&rsquo;t be worked out, so the card is as it was.
              </p>
            )}
          </Disclosure>
        )}
      </div>
    </article>
  );
}

function SceneChips({ observe }: { observe: ObserveResult }) {
  // Formatted from the result's own distance, so the chip, the button and the picture's caption can't disagree.
  const chips = [sceneLabel(observe.input.scene), formatDistance(observe.distanceM), lightLabel(observe.input.light), viewerShort(observe.input.viewer)];
  return (
    <ul aria-label="The scene" className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li key={chip} className="border border-rule-strong px-2.5 py-1 text-[0.875rem] leading-snug text-ink-soft">
          {chip}
        </li>
      ))}
    </ul>
  );
}

function Block({ id, title, shape, lines, empty }: { id: string; title: string; shape: "solid" | "hollow"; lines: string[]; empty: string }) {
  return (
    <div>
      <h5 id={id} className="eyebrow !text-[0.875rem] !text-ink">
        {title}
      </h5>
      {lines.length === 0 ? (
        <p className="mt-2 text-[1rem] leading-snug text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {lines.map((text) => (
            <li key={text} className="flex items-start gap-3 text-[1rem] leading-snug">
              <span
                aria-hidden="true"
                className={`mt-[0.4rem] block h-2.5 w-2.5 shrink-0 rounded-full border border-ink ${shape === "solid" ? "bg-ink forced-colors:bg-[CanvasText]" : "bg-transparent"}`}
              />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditedKnow({ observe }: { observe: ObserveResult }) {
  return (
    <div className="space-y-2 text-[0.9375rem] leading-relaxed">
      <h5 className="eyebrow">The scene, as edited</h5>
      <ul className="list-disc space-y-1 pl-5 text-ink-soft marker:text-ink">
        {observe.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  );
}
