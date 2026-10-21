"use client";

import Image from "next/image";
import { useId, useMemo, useState } from "react";
import type { ShareData } from "@/components/results/types";
import { MARK_SAFETY_LINE, SAFETY_CONCERNS } from "@/lib/copy";
import { MAX_SHARE_LINES } from "@/lib/integration/shareLines";

const FORMATS = [
  { id: "4x5", label: "4:5 post", width: 1080, height: 1350 },
  { id: "9x16", label: "9:16 story", width: 1080, height: 1920 },
] as const;

type FormatId = (typeof FORMATS)[number]["id"];

interface ShareStudioProps {
  share: ShareData;
  /** A visitor's own photo: say plainly that it never goes on a card. */
  ownPhoto: boolean;
}

/**
 * The share card: a face-less picture of the relief lines you choose, drawn on our server from a few tokens (nothing is
 * stored), with the qualifier and, for synthetic faces, "Synthetic face (AI-generated)" painted into the picture. A demo
 * face can be added; an own photo never can.
 */
export function ShareStudio({ share, ownPhoto }: ShareStudioProps) {
  const [selected, setSelected] = useState<string[]>(share.defaults);
  const [format, setFormat] = useState<FormatId>("4x5");
  const [face, setFace] = useState(false);
  const [note, setNote] = useState("");
  const linesId = useId();
  const formatId = useId();

  const chosen = share.choices.filter((c) => selected.includes(c.token));
  const markChosen = chosen.some((c) => SAFETY_CONCERNS.includes(c.concern));
  const url = useMemo(() => {
    const q = new URLSearchParams({ format, lines: selected.join(",") });
    if (face && share.faceAllowed) q.set("face", "1");
    else if (share.tag && !share.faceAllowed) q.set("synthetic", "1");
    return `/share/${share.cardKey}/card?${q.toString()}`;
  }, [format, selected, face, share]);
  const size = FORMATS.find((f) => f.id === format)!;

  const textLines = chosen.length ? chosen.map((c) => c.text) : ["Up close you see every detail. From here, you see a person."];
  const asText = [`From where others stand`, ...textLines, share.qualifier, ...(share.tag ? [share.tag] : []), ...(markChosen ? [MARK_SAFETY_LINE] : [])].join("\n");
  const alt = `Share card, ${size.label}. From where others stand. ${textLines.join(". ")}. ${share.qualifier} ${share.tag ?? ""}`.trim();

  const toggle = (token: string) =>
    setSelected((cur) => (cur.includes(token) ? cur.filter((t) => t !== token) : cur.length < MAX_SHARE_LINES ? [...cur, token] : cur));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText);
      setNote("Copied.");
    } catch {
      setNote("Copying isn't available here. Select the text and copy it instead.");
    }
    window.setTimeout(() => setNote(""), 2600);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
      <div className="order-2 lg:order-1">
        <fieldset aria-describedby={`${linesId}-hint`}>
          <legend className="eyebrow !text-[0.875rem]">Lines on the card</legend>
          <p id={`${linesId}-hint`} className="mt-2 max-w-[30rem] text-[0.875rem] leading-relaxed text-ink-soft">
            Only good news is on offer, in the same words as the cards. Pick up to {MAX_SHARE_LINES}.
          </p>
          {share.choices.length === 0 ? (
            <p className="mt-4 max-w-[30rem] text-[1rem] leading-relaxed text-ink-soft">
              Nothing on this face is out of sight at the distances we check, so the card carries one general line instead.
            </p>
          ) : (
            <ul className="mt-3 border-t border-rule">
              {share.choices.map((c) => {
                const on = selected.includes(c.token);
                const full = !on && selected.length >= MAX_SHARE_LINES;
                return (
                  <li key={c.token} className="border-b border-rule">
                    <label className={`flex min-h-12 cursor-pointer items-center gap-3 py-2 ${full ? "opacity-60" : ""}`}>
                      <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#161513]" checked={on} disabled={full} onChange={() => toggle(c.token)} />
                      <span className="serif text-[1.125rem] leading-snug">{c.text}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <fieldset className="mt-8" aria-describedby={`${formatId}-hint`}>
          <legend className="eyebrow !text-[0.875rem]">Size</legend>
          <div className="mt-3 inline-flex border border-ink" role="radiogroup" aria-label="Size of the card">
            {FORMATS.map((f) => (
              <label key={f.id} className="relative cursor-pointer">
                <input type="radio" name={formatId} className="peer sr-only" checked={format === f.id} onChange={() => setFormat(f.id)} />
                <span className="flex min-h-11 items-center border-l border-ink px-5 text-[0.9375rem] first:border-l-0 hover:bg-ink/5 peer-checked:bg-ink peer-checked:text-paper peer-checked:hover:bg-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink forced-colors:peer-checked:bg-[Highlight] forced-colors:peer-checked:text-[HighlightText]">
                  {f.label}
                </span>
              </label>
            ))}
          </div>
          <p id={`${formatId}-hint`} className="sr-only">
            Both sizes carry the same lines.
          </p>
        </fieldset>

        {share.faceAllowed ? (
          <label className="mt-6 flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#161513]" checked={face} onChange={(e) => setFace(e.target.checked)} />
            <span className="text-[1rem]">Include the synthetic face</span>
          </label>
        ) : (
          ownPhoto && <p className="mt-6 max-w-[30rem] text-[0.875rem] leading-relaxed text-ink-soft">Your photo is never put on a card, and nothing about it is stored to draw one.</p>
        )}
        {markChosen && <p className="mt-4 max-w-[30rem] border-l-2 border-ink pl-3 text-[0.875rem] leading-relaxed text-ink-soft">{MARK_SAFETY_LINE} It goes on the card too.</p>}

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a href={`${url}&download=1`} download={`arms-length-${format}.png`} className="btn btn-primary">
            Download the picture
          </a>
          <button type="button" onClick={copy} className="btn btn-ghost">
            Copy as text
          </button>
          <p role="status" className="min-h-6 text-[0.875rem] text-ink-soft">
            {note}
          </p>
        </div>
      </div>

      <div className="order-1 mx-auto w-full max-w-[26rem] lg:order-2 lg:max-w-[28rem]">
        <Image
          key={url}
          src={url}
          alt={alt}
          width={size.width}
          height={size.height}
          unoptimized
          className="h-auto w-full border border-ink bg-paper-deep"
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
        />
      </div>
    </div>
  );
}
