/** The size-doubling numbers the chart and the how-it-works page quote, all read from summary.json so none is typed by hand. */

interface ScalingInput {
  llm2over1: number | null;
  llm4over2: number | null;
  llm2over1Range: readonly number[] | null;
  llm4over2Range: readonly number[] | null;
}

export interface DoublingInput {
  testB: {
    scaling: readonly ScalingInput[];
    aggregate: { meanScalingRatio: { llm2over1: number; llm4over2: number } };
  };
}

export interface DoublingFacts {
  /** Mean over the three contrasts of the ratio of median answers, 1 to 2 mm and 2 to 4 mm (ideal 2.0). */
  mean1to2: number;
  mean2to4: number;
  /** Lowest and highest of the six ratios of medians. */
  medianLow: number;
  medianHigh: number;
  /** Lowest and highest ratio over every pair of one answer per size. */
  pairLow: number;
  pairHigh: number;
}

export function doublingFacts(s: DoublingInput): DoublingFacts {
  const rows = s.testB.scaling;
  const medians = rows.flatMap((r) => [r.llm2over1, r.llm4over2]).filter((v): v is number => v !== null);
  const pairs = rows.flatMap((r) => [...(r.llm2over1Range ?? []), ...(r.llm4over2Range ?? [])]);
  const { llm2over1, llm4over2 } = s.testB.aggregate.meanScalingRatio;
  return {
    mean1to2: llm2over1,
    mean2to4: llm4over2,
    medianLow: Math.min(...medians),
    medianHigh: Math.max(...medians),
    pairLow: Math.min(...pairs),
    pairHigh: Math.max(...pairs),
  };
}
