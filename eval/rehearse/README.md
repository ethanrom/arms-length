# Do the numbers matter?

The same model, **Claude Sonnet 5.5 on Amazon Bedrock** (the model the Rehearse agent uses, effort `low`), asked about the same 4 faces and 6 days twice: once through our agent, which calls the deterministic vision model for every number it writes, and once on its own, given the photo and the day. Both are scored against our model. This is the Rehearse counterpart of [llm-baseline](../llm-baseline/README.md), which asks the same kind of question about single distances.

## Short version

The question we expected to answer was "does the unaided model make people cover things nobody can see?". It does not. **The data say the opposite, and the more useful finding is a different one.**

- **No needless covering, from either arm.** Of the 138 concern-moments our model puts out of sight for the viewer the model chose, the unaided model advised "cover" on **0**; the agent, of 64, on **0**. The unaided model advises covering in only 9% of its answers. The "effort the numbers save" is not in over-cover.
- **The unaided model under-reports.** Our model says a typical viewer can pick out something in 630 of 768 concern-moments. The unaided model called 73% of those "not noticeable" (67% to 78%). It contradicts our model on **60%** of concern-moments (56% to 63%), against **4.2%** for the agent's plans (2.1% to 6.6%). Resampling whole face-and-day pairs, the gap is 51% to 59% (95%).
- **Much of that is not seeing the marks.** 269 times (35%) it said a kind of mark is not on the face where our masks found it (dark spots 30, fine lines 30, under-eye puffiness 95, breakouts 88, under-eye shadows 26). Leave those out and count only where it gave a judgment: it still contradicts our model on 45%.
- **It is not noisy; relative to our model it leans.** Asked the same thing twice, its `noticeable` answers differ on 2.7% of concern-moments where it picked the same scene, light and viewer (9 of 331); it picked the same scene, light and viewer for 86% of moments. So the gap above is a consistent lean toward "not noticeable", not run-to-run scatter. That weakens a "the AI is unstable" argument; it does not weaken "the AI is not anchored to the measurements".
- **Share estimates are loose.** On pores, dark spots, breakouts and fine lines its mean absolute error against our share is 0.33 (0 to 1) and the correlation is 0.43 (0.62 where it gave a judgment).
- **The agent's plans carry the numbers without drifting.** 21 of 24 plans passed the verifier first time and 3 after one repair; 0 fell back to the deterministic plan. Re-running `verifyPlan` on every shipped plan against its own results finds **0 unverified numbers of 402** shipped. Its sentences disagree with our model on 4.2% of concern-moments; 12 of the 14 are a plan naming a small quoted fraction ("about 1 in 13") as picked out, which is true and sits under the 10% line (2 of those are sentences that call the group out of sight or lost, which my name matching reads as noticing; see the list).
- **The price:** $0.041 and 15.1 s per plan against $0.006 and 6.9 s for an unaided answer.

**What this does not show.** The truth here is our own model, so the agent's low contradiction rate is close to guaranteed by construction: its tool hands it the same "needs a change" list (share above 10%) that the scoring uses. It measures faithfulness, not accuracy. Whether our model is closer to what real people pick out than the unaided model's judgment is not tested here; that rests on the ModelFest comparison and the walk-back self-test (see `docs/EVAL.md`). What this experiment does show is that the unaided model gives different answers from the model on most questions, by a wide margin and almost all in one direction (at the 10% line it never calls noticeable what the model puts out of sight), and that the plan the agent writes keeps to the model's answers and its numbers.

## Method

**Inputs.** The four demo faces (`public/demo/{p1a,p2b,p3a,p5a}`, synthetic AI-generated portraits) and six days. The first three are the app's example days, for which recorded agent plans exist (`fixtures/rehearse/<face>/<day>.json`); the other three were written for this test.

| Day | Text | Calls on | Agent plan |
| --- | --- | --- | --- |
| `workday` | 9am video standup on my laptop, lunch with a client by the window, dinner date at 7 | laptop | recorded fixture |
| `presenting` | Presenting to the team at 2pm in the big meeting room, then drinks with colleagues after work | laptop | recorded fixture |
| `wedding` | Wedding guest: outdoor ceremony in the afternoon sun, then dinner and dancing in the evening | laptop | recorded fixture |
| `interview` | Job interview at 10 in a small office, then coffee with a friend at a cafe table | laptop | run for this experiment |
| `teaching` | Teaching a class all morning, then parent video calls on my phone in the afternoon | phone | run for this experiment |
| `beach` | Beach day with friends in bright sun, then a candle-lit dinner for two | laptop | run for this experiment |

**With our numbers.** `runAgent` (`lib/agent/loop.ts`) with the real Bedrock client and the real engine, exactly as the app runs it: the system prompt in `lib/agent/prompt.ts`, the tools in `lib/agent/tools.ts`, the verifier in `lib/agent/verify.ts`, `prefs.callDevice` as in the table, makeup allowed. The 12 plans for the example days are the recorded fixtures, not re-run; the 12 others were run for this experiment. Each shipped plan is checked again with `verifyPlan` against its own results.

**Without our numbers.** The same model, the same effort and output ceiling as the agent's adapter, the face photo (`public/demo/<face>/photo.jpg`, sent unchanged) and the day text, **no tools**. It sees the same scene, light and viewer ids and labels as the agent's prompt, the scene distances from the same table, the iris and pupil distance as a ruler, and the definition of "noticeable" the scoring uses, including the one-in-ten line. It sees no tool result: no share, no count, no distance in metres for a call. It answers in strict JSON: moments, each with a scene, light and viewer and, for each of the seven concerns, `{ noticeable, share, advice }` or `null` for "not on this face". Every face-and-day pair is asked **twice**. Prompt caching is on for the system prompt and the photo, as in the agent's adapter. Prompts, verbatim:

```text
You help one person see what other people can actually pick out of their skin in each moment of a day. You are given a photo of their face and a description of their day.

Look at the photo: which kinds of marks this face has, how big each is (the iris is about 11.71 mm across and the distance between the pupils is about 63 mm, so use them as a ruler), and how much darker or redder each is than the skin around it. Then think about how far away the other person is in each moment, the light, and how well they see.

## Steps
1. Split the day into 1 to 8 moments, in time order.
2. For each moment choose one scene, one light and one viewer from the tables below. Use the ids exactly. Where the person did not say, use the scene's default light and the typical viewer.
3. For each moment, for each kind of mark, judge what that other person could pick out and whether you would suggest covering it.

## Scenes
- close_talk: Close: a hug, a whisper, getting ready together (about 0.5 m; default light indoor)
- cafe_table: Coffee at a small table (about 0.8 m; default light indoor)
- conversation: Standing conversation (about 1 m; default light indoor)
- dinner_table: Across a dinner or meeting table (about 1.5 m; default light home)
- meeting_room: Across a meeting room (about 2.5 m; default light indoor)
- presenting: Presenting to a room (about 4 m; default light indoor)
- video_call: Video call (the other person sees you on a screen; default light videoCall)

## Lights
- home: dim home or restaurant light, candlelit dinners, evenings in
- indoor: office, cafe, shop or a bright room
- overcast: cloudy daylight outdoors, or open shade
- daylight: bright sun outdoors, or sitting by a sunny window
- videoCall: the glow of a screen, the default for calls

## Viewers
- typical: most people, 20/20 sight (the default)
- blurry: someone without their glasses, 20/40 sight

## Kinds of marks
pore = pores; age_spot = dark spots; acne = breakouts; wrinkle = fine lines; dark_circle = under-eye shadows; eye_bag = under-eye puffiness; redness = redness

## What to say about each kind of mark, at each moment
- noticeable: true when that other person, looking straight at this person with nothing else competing for their attention, could pick out at least about one in ten of that kind of mark. For a single large soft area (under-eye shadows, under-eye puffiness, broad redness) true when they could pick out the area. Otherwise false.
- share: your best estimate, from 0 to 1, of the fraction of that kind of mark on this face that such a person could pick out. For a single large soft area give 1 if it can be picked out and 0 if not.
- advice: "cover" if you would suggest covering or softening it for this moment (for example with makeup), "nothing" if no effort is needed.
- If a kind of mark is not on this face, give null for it instead of an object.
What is easy to see in a close-up photo can be too small or too faint to pick out at the distance of the moment, and large soft areas carry much farther than small dots. Be calibrated: do not call something visible just because it is on the face, and do not call it invisible just because it is small.

## Reply
JSON only, no markdown fence and no commentary, in this shape (every one of the 7 kinds of marks in every moment):
{"moments":[{"title":"short title","time":"9am" or null,"scene":"<scene id>","light":"<light id>","viewer":"typical" or "blurry","concerns":{"pore":{"noticeable":true,"share":0.4,"advice":"cover"},"age_spot":{"noticeable":true,"share":0.4,"advice":"cover"},"acne":{"noticeable":true,"share":0.4,"advice":"cover"},"wrinkle":{"noticeable":true,"share":0.4,"advice":"cover"},"dark_circle":{"noticeable":true,"share":0.4,"advice":"cover"},"eye_bag":{"noticeable":true,"share":0.4,"advice":"cover"},"redness":{"noticeable":true,"share":0.4,"advice":"cover"}}}]}
```

The user message is the photo, then (for `workday`):

```text
My day: 9am video standup on my laptop, lunch with a client by the window, dinner date at 7

Settings: video calls are on my laptop. Makeup is fine if it is the only thing that helps.
```

(The `teaching` day says "phone"; the others "laptop". The agent gets the same two lines as its user message.)

**Truth, and how a moment is scored.** Each arm is scored on the scene, light and viewer **it chose**, with `observeScene(face, { scene, light, viewer })`. A video call that has no geometry (every unaided call) is scored at `defaultCall(device)`: the camera distance a laptop or phone usually has, in speaker view. A concern is **noticeable** when the model's typical share (average observer, no safety margin) is above 10%, the same line as `FREE_FIX_GOAL`, the lightest touch the app aims for; large soft areas have a share of 0 or 1. Concerns the face has no targets for are skipped. The unaided model is asked about all seven concerns; a "not on this face" answer counts as "not noticeable, nothing to do" and is shown separately.

The agent writes sentences, not flags, so its verdicts are read from them: a concern named in a moment's `notice` sentences is "noticeable", one named in `outOfSight` is "not noticeable" (2 named in both and 18 not named at all are left out); "cover" is a `lightest_touch` action on that concern. A change of distance or light (`free_fix`) is not "cover".

| Metric | Definition |
|---|---|
| Contradiction | the system's `noticeable` differs from the model's, over the concern-moments where it took a stand |
| Missed / false alarm | said "not noticeable" where it is / said "noticeable" where it is not |
| Over-cover (headline) | "cover" advised, among the concern-moments the model says are out of sight |
| Under-warning | advice "nothing", among the concern-moments the model says are noticeable (a person may sensibly choose to do nothing about something noticeable, so this is the softer measure; "missed" is the claim) |
| Mean absolute share error | `|share said - model's typical share|`; large soft areas are 0 or 1 in the model, so the table also gives marks only |
| Run-to-run | the two repeats' `noticeable` answers, moment by moment, where both chose the same scene, light and viewer |

Intervals are 95% percentile intervals from a bootstrap that resamples whole face-and-day pairs (24 of them; 2,000 resamples, fixed seed), because concern-moments inside one reply are not independent.

## Results

### The headline, every concern

|  | Without: all answers | Without: only where it gave a judgment | With our numbers |
| --- | --- | --- | --- |
| Concern-moments scored | 768 | 499 | 332 |
| **Contradiction rate** (noticeable yes/no differs from the model) | **60%** (56% to 63%) | 45% (37% to 53%) | **4.2%** (2.1% to 6.6%) |
| Missed: said not noticeable where the model says a typical viewer can pick it out | 73% (67% to 78%) | 57% (46% to 67%) | 0.7% (0% to 1.8%) |
| False alarm: said noticeable where the model says it is not | 0% | 0% | 20% (10% to 31%; see below) |
| **Over-cover rate**: "cover" advised where the model says out of sight | **0%** (0 of 138) | 0% (0 of 100) | **0%** (0 of 64) |
| Under-warning: advice "nothing" where the model says noticeable | 89% (560 of 630) | 82% (329 of 399) | not comparable (91%): the plan offers a free change first and says what is in sight |
| Mean absolute share error (0 to 1) | 0.49 | 0.39 | no number: the plan quotes the model's |
| Cover advised, as a share of concern-moments | 9% | 14% | 7% |

"Only where it gave a judgment" leaves out the 269 answers of "not on this face".

### The same, marks only (large soft areas left out)

The model calls under-eye shadows and puffiness, and broad redness, in sight at every distance in its scene table, so they are a one-word question and nearly all of the unaided model's misses on them are the same miss. This table drops them.

|  | Without: all answers | Without: only where it gave a judgment | With our numbers |
| --- | --- | --- | --- |
| Concern-moments scored | 472 | 324 | 204 |
| **Contradiction rate** (noticeable yes/no differs from the model) | **49%** (44% to 55%) | 38% (28% to 47%) | **6.9%** (3.4% to 11%) |
| Missed: said not noticeable where the model says a typical viewer can pick it out | 70% (63% to 77%) | 55% (41% to 67%) | 1.4% (0% to 3.4%) |
| False alarm: said noticeable where the model says it is not | 0% | 0% | 20% (10% to 31%; see below) |
| **Over-cover rate**: "cover" advised where the model says out of sight | **0%** (0 of 138) | 0% (0 of 100) | **0%** (0 of 64) |
| Under-warning: advice "nothing" where the model says noticeable | 89% (296 of 334) | 83% (186 of 224) | not comparable (83%): the plan offers a free change first and says what is in sight |
| Mean absolute share error (0 to 1) | 0.33 | 0.28 | no number: the plan quotes the model's |
| Cover advised, as a share of concern-moments | 8% | 12% | 12% |

### Where it goes wrong, by concern

| Concern | Moments | Noticeable per model | Missed, in person | Missed, on video calls | Said "not on this face" | Said noticeable, model says not | Covers advised | Agent: contradiction |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pores | 118 | 46 of 118 | 30 of 44 | 2 of 2 | 0 | 0 | 0 | 8.2% |
| Dark spots | 118 | 114 of 118 | 62 of 98 | 14 of 16 | 30 | 0 | 12 | 5.7% |
| Breakouts | 118 | 88 of 118 | 54 of 78 | 6 of 10 | 88 | 0 | 26 | 2.0% |
| Fine lines | 118 | 86 of 118 | 65 of 86 | none noticeable | 30 | 0 | 0 | 12% |
| Under-eye shadows | 118 | 118 of 118 | 87 of 102 | 15 of 16 | 26 | 0 | 0 | 0% |
| Under-eye puffiness | 118 | 118 of 118 | 102 of 102 | 16 of 16 | 95 | 0 | 0 | 0% |
| Redness | 60 | 60 of 60 | 4 of 52 | 0 of 8 | 0 | 0 | 32 | 0% |

Reading it:

- **Under-eye puffiness and shadows** are in sight in every moment for the model. The unaided model called puffiness noticeable in 0 of 118 and shadows in 16 of 118; it said puffiness is not on the face 95 times and shadows 26 times.
- **Breakouts**: it said "not on this face" 88 times of 118. The masks found 40, 18, 5, 3 breakouts on the four faces (p1a, p2b, p3a, p5a). It advised covering them 26 times.
- **Dark spots**: missed 62 of 98 in-person moments where the model has some in sight and 14 of 16 on calls; it said "not on this face" 30 times (found: 64, 89, 194, 53).
- **Pores**: in person it missed 30 of 44 moments where the model has more than a tenth in sight. On calls the model has pores in sight in only 2 of 16 concern-moments (the video cannot carry them) and the unaided model agreed on 14 of 16.
- **Fine lines**: missed 65 of 86 in-person moments; "not on this face" 30 times.
- **Redness** is where it agrees most (contradiction 7%), and where it advises covering most often (32 times).

### Run-to-run: the unaided model asked twice

|  |  |
| --- | --- |
| Pairs with two readable replies | 24 |
| Same number of moments | 24 of 24 |
| Moments compared by position | 59 |
| Same scene, light and viewer | 51 of 59 (86%) |
| `noticeable` differs, same choice | 9 of 331 (2.7%) |
| `noticeable` differs, any choice | 17 of 384 (4.4%) |
| `advice` differs, same choice | 5 of 331 (1.5%) |
| Mean absolute difference in `share`, same choice | 0.019 |

The agent was run once per pair, so it has no repeat to compare. Its tools are deterministic: the same scene on the same face gives the same numbers, byte for byte.

### Did we under-think the unaided model? Effort `high`

8 extra unaided calls at effort `high` (the `workday` and `beach` days on every face, one run each), against the first run at the default effort on the same 8 pairs.

|  | Default effort | High effort |
| --- | --- | --- |
| Concern-moments | 130 | 130 |
| Contradiction rate | 61% | 55% |
| Missed rate | 74% | 67% |
| Contradiction, only where it gave a judgment | 45% | 48% |
| Said "not on this face" | 48 | 30 |
| Over-cover | 0 of 23 | 0 of 23 |
| Mean output tokens | 511 | 1,769 |

More thinking moves the numbers a little and the pattern not at all. Eight pairs is a small check, not a result.

### How much the 10% line matters

The same replies, scored with other lines for "noticeable" (the unaided model was told one in ten; the agent follows its own tool's 10%).

| Noticeable if model share is | Without: contradiction | Without: missed | Without: false alarm | Without: over-cover | Without, judged only: contradiction | With: contradiction | With: false alarm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| > 5% | 64% | 74% | 0% | 0% | 50% | 3% | 7% |
| > 10% | 60% | 73% | 0% | 0% | 45% | 4% | 20% |
| > 25% | 54% | 72% | 8% | 6% | 43% | 13% | 47% |
| > 50% | 49% | 70% | 10% | 6% | 39% | 22% | 60% |

A higher line lowers the unaided model's misses and raises its false alarms, and raises the agent's disagreements, since it keeps to 10%. The unaided model's contradiction rate stays above the agent's at every line tried, but the gap narrows to 27 points at 50%, so the size of the gap depends on where "noticeable" is drawn.

### The agent's plans

|  |  |
| --- | --- |
| Plans shipped (24 = 4 faces x 6 days) | 24 |
| ...of which recorded fixtures reused / run here | 12 / 12 |
| Verified on the first try | 21 |
| Verified after one repair round | 3 |
| Deterministic fallback shipped | 0 |
| Numbers written in the shipped claims (clock times excluded) | 402 |
| ...not in a quote of the result the claim cites (`verifyPlan` re-run on each shipped plan) | **0** |
| Other `verifyPlan` issues on shipped plans (wording, refs, actions) | 0 |
| Moments whose cited observation differs from `observeScene` run again | 0 |
| Moments in the 24 plans (about 2.3 per plan) | 54 |
| Actions: none / lightest_touch / free_fix | 24 / 26 / 4 |

The plan sentences that disagree with the model at the 10% line (14 concern-moments; 12 name a fraction under one in ten as picked out, 2 list as out of sight a concern with a little over a tenth in view):

| Plan | Scene | Concern | Plan says | Model share | Sentence |
| --- | --- | --- | --- | --- | --- |
| p1a presenting #1 | presenting | Fine lines | noticeable | 7.5% | Fine lines (about 1 in 13), redness, under-eye shadows and under-eye puffiness could also be noticeable. |
| p1a presenting #2 | conversation | Pores | noticeable | 8.4% | Pores (about 1 in 12), redness, under-eye shadows and under-eye puffiness could also be noticeable. |
| p1a interview #1 | dinner_table | Pores | noticeable | 8.2% | Pores are the quietest here, with about 1 in 12 picked out. |
| p2b wedding #2 | dinner_table | Breakouts | out of sight | 11.1% | In evening light at home at 1.5 m, only about 1 in 9 breakouts and about 1 in 30 pores are picked out by a typical viewer. |
| p2b beach #2 | dinner_table | Pores | noticeable (misread: the sentence says out of sight or lost) | 3.4% | Breakouts (about 1 in 9) and pores (about 1 in 30) are mostly out of sight, though under-eye shadows and puffiness could be seen. |
| p3a teaching #2 | video_call | Pores | out of sight | 11.3% | 143 of 221 pores are also below what the camera can carry. |
| p5a workday #1 | video_call | Dark spots | noticeable (misread: the sentence says out of sight or lost) | 9.4% | Dark spots are mostly lost too, with only about 1 in 11 picked out at 4 m, though under-eye shadows and puffiness could still be noticeable. |
| p5a workday #3 | dinner_table | Fine lines | noticeable | 5.6% | A typical viewer could notice about half of dark spots and about 1 in 18 fine lines, plus under-eye shadows and puffiness. |
| p5a presenting #1 | presenting | Dark spots | noticeable | 5.7% | Dark spots are about 1 in 18 and fine lines about 1 in 54 for a typical viewer from there. |
| p5a presenting #1 | presenting | Fine lines | noticeable | 1.9% | Dark spots are about 1 in 18 and fine lines about 1 in 54 for a typical viewer from there. |
| p5a wedding #2 | dinner_table | Fine lines | noticeable | 5.6% | Fine lines are faint, with 6 of 107 in sight. |
| p5a teaching #1 | presenting | Dark spots | noticeable | 5.7% | From 4 m, a typical viewer could pick out under-eye shadows and under-eye puffiness, and a few dark spots (3 of 53) and fine lines (2 of 107). |
| p5a teaching #1 | presenting | Fine lines | noticeable | 1.9% | From 4 m, a typical viewer could pick out under-eye shadows and under-eye puffiness, and a few dark spots (3 of 53) and fine lines (2 of 107). |
| p5a beach #2 | dinner_table | Fine lines | noticeable | 5.6% | A typical viewer could pick out dark spots (about half) and fine lines (about 1 in 18) at 1.5 m. |

### Cost and time

|  | Median time | Requests | Mean cost | Total cost |
| --- | --- | --- | --- | --- |
| Agent run (with numbers), 24 plans | 15.1 s | 4.4 model requests, 9 tool calls (median) | $0.041 | $0.98 |
| Unaided call (without numbers), 48 calls | 6.9 s | 1 request, no tools | $0.006 | $0.31 |

68 calls were made for this experiment (cap 70): 12 agent runs, 56 unaided calls (8 of them the high-effort check) and 0 cache-rejection repeats. The agent runs made 53 model requests inside them, 109 in all. Estimated cost **$0.93** (cap $5) at $2 in and $10 out per million tokens, with cache reads at 0.1x and writes at 1.25x the input price; Bedrock billing may differ. The 12 reused fixtures cost $0.53 when they were recorded; the table above includes them. Tokens: 4,026 uncached in, 650,263 cache read, 77,298 cache written, 59,599 out. No YouCam units were used.

## Honest limits

- **The truth is our model.** Both arms are scored against `observeScene`. It is validated on ModelFest (lab thresholds) and checked by the walk-back test, not against people looking at these faces. The agent's low disagreement is by construction (see above). A reader who doubts the model should read this as "the unaided model answers differently from the model", not "the unaided model is wrong".
- **Small and synthetic.** Four AI-generated faces, six days, 118 unaided moments and 54 planned ones. The intervals above resample 24 face-and-day pairs and do not cover a different prompt, a different face or a different model.
- **The 10% line is a convention.** It is the app's lightest-touch goal, and the unaided model was told it. The sensitivity table shows what other lines do; no line is right in any absolute sense.
- **"Noticeable" is detectability, not attention.** The model asks whether a typical viewer looking right at the mark could pick it out. People in a conversation do not always look that closely, and an unaided answer of "nobody will notice" may be a fair reading of attention rather than a wrong reading of sight. The prompt asked for the first; the model may have answered the second.
- **Soft areas.** Under-eye shadows, puffiness and broad redness are "in sight" at every scene distance in the model, so they are 3 of the 7 concerns and a large share of the misses. The marks-only table removes them.
- **Calls are scored loosely for the unaided model.** It has no camera geometry, so its video calls are scored at the speaker-view default for the device the day implies. The agent picks its own geometry (often a gallery tile) and is scored on that.
- **The unaided model cannot see the masks.** It was given the photo, not the YouCam masks, so some of its "not on this face" answers may be marks too small or faint to see in a 1,080-pixel photo. That is a real limit of asking without measurements; it is also a handicap this test did not try to remove.
- **Effort.** The default effort is the agent's. The high-effort check covers eight pairs.
- **Sentence reading.** The agent's verdicts are read from its sentences by concern name (`planVerdicts` in `score.ts`), so a sentence that mixes verdicts is read as one list's. The 2 named in both lists are left out and the 14 disagreements are listed above to be read by eye.
- **One model, one prompt wording, two repeats.** A better prompt for the unaided model may do better.

## Reproduce

```
npm run spike -- eval/rehearse/run.ts              # calls the model for every uncached item (needs CLAUDE_AWS_* in .env), then rewrites results/ and this file
npx tsx eval/rehearse/run.ts --offline             # no network: rebuild summary.json, prompts.md and README.md from the cache and the fixtures
npx tsx eval/rehearse/run.ts --prompts             # write prompts.md only
npx vitest run eval/rehearse                       # the scoring maths
```

`run.ts` never calls a finished item again (one file per call under `results/raw/`), checks the 70-call and $5 caps before every call, and allows one retry per unaided run for an unreadable reply (none was needed).

| File | What |
|---|---|
| `run.ts` | the driver: tasks, caps, cache, offline rebuild |
| `call.ts`, `store.ts` | the two model calls, the raw cache and the spend ledger |
| `prompts.ts`, `prompts.md` | the unaided arm's prompts and reply parser (the markdown is generated) |
| `truth.ts` | our model's answer for a moment |
| `score.ts`, `score.test.ts` | the scoring maths and its tests |
| `summary.ts`, `readme.ts` | `results/summary.json` and this file |
| `results/raw/with/` | the 12 agent runs made here (plan, steps, tokens, verifier re-check) |
| `results/raw/without/`, `results/raw/without-high/` | every unaided reply, as sent back |
