"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SCENES, type CallGeometry, type DayPlan, type LightId, type ObserveResult, type SceneId } from "@/lib/contracts/rehearse";
import { observeOf } from "@/lib/rehearse";
import { Stage } from "./stage/Stage";
import type { StagePhoto } from "./stage/types";
import { useCalm } from "./useCalm";

/** A moment the run has found so far, from the step that named it. */
export interface SketchPanel {
  key: string;
  title: string;
  scene: SceneId;
}

interface BuildingProps {
  photo: StagePhoto;
  panels: readonly SketchPanel[];
  /** The latest step, in words. */
  status: string;
  /** Set once the plan lands: the faces fade into the sketches before the day opens. */
  landed: DayPlan | null;
}

const DRAW_MS = 1400;
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

/** 0 to 1 over `DRAW_MS` once mounted: how much of a sketch's line art has been drawn. */
function useDrawn(): number {
  const calm = useCalm();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (calm) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / DRAW_MS);
      setValue(ease(k));
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [calm]);
  return calm ? 1 : value;
}

const lightOf = (scene: SceneId): LightId => SCENES.find((s) => s.id === scene)?.light ?? "indoor";

/** Fades its child in after it mounts: the face arriving over a sketch that is already there. */
function FadeIn({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return <div className={`absolute inset-0 transition-opacity duration-[1100ms] ease-out ${on ? "opacity-100" : "opacity-0"}`}>{children}</div>;
}

interface SketchProps {
  title: string;
  scene: SceneId;
  light: LightId;
  call?: CallGeometry;
  observe: ObserveResult | null;
  photo: StagePhoto;
}

function Sketch({ title, scene, light, call, observe, photo }: SketchProps) {
  const drawn = useDrawn();
  return (
    <li data-testid="sketch" data-landed={observe ? "true" : "false"}>
      <div className="relative">
        <div aria-hidden="true">
          <Stage scene={scene} light={light} call={call} observe={null} photo={photo} drawn={drawn} label="" />
        </div>
        {observe && (
          <FadeIn>
            <Stage scene={scene} light={light} call={call} observe={observe} photo={photo} drawn={1} priority="later" label={`${title}, as the people there see you`} />
          </FadeIn>
        )}
      </div>
      <p className="eyebrow mt-3 !text-[0.875rem] !text-ink">{title}</p>
    </li>
  );
}

/** The storyboard: each moment the run finds sketches itself in, and when the plan lands your face arrives in every frame. */
export function Building({ photo, panels, status, landed }: BuildingProps) {
  const fromPlan = landed
    ? landed.moments.map((m) => ({
        key: m.id,
        title: m.title,
        scene: m.scene.scene,
        light: m.scene.light ?? lightOf(m.scene.scene),
        call: m.scene.call,
        observe: observeOf(landed, m),
      }))
    : null;
  const sketches = fromPlan ?? panels.map((p) => ({ key: p.key, title: p.title, scene: p.scene, light: lightOf(p.scene), call: undefined, observe: null }));

  return (
    <div className="mx-auto w-full max-w-[84rem] px-5 pb-12 pt-4 md:px-10 md:pt-8" data-testid="rehearse-building" data-landed={landed ? "true" : "false"}>
      <h2 data-autofocus tabIndex={-1} className="serif text-[clamp(2rem,1.4rem+2.6vw,3.5rem)] leading-[1.05] tracking-[-0.02em] outline-none" style={{ fontWeight: 340 }}>
        {landed ? "Here is your day." : "Sketching your day."}
      </h2>
      <p role="status" aria-live="polite" data-testid="rehearse-status" className="mt-3 min-h-[1.75rem] text-[1.0625rem] leading-snug text-ink-soft">
        {landed ? "" : status}
      </p>

      {sketches.length === 0 ? (
        <div aria-hidden="true" className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="border border-dashed border-rule-strong" style={{ aspectRatio: "16 / 10" }} />
        </div>
      ) : (
        <ol className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {sketches.map((s, i) => (
            <Sketch key={i} title={s.title} scene={s.scene} light={s.light} call={s.call} observe={s.observe} photo={photo} />
          ))}
        </ol>
      )}
    </div>
  );
}
