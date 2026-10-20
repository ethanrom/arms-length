import type { Metadata } from "next";
import { SelfTest } from "@/components/self-test/SelfTest";
import { MOCK_SELF_TEST } from "@/lib/mock/selfTest";

export const metadata: Metadata = {
  title: "Walk-back self-test",
  description: "Check the model against your own eyes: calibrate your screen, walk back until a spot disappears, and compare.",
};

export default function SelfTestPage() {
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page pb-16 pt-10 md:pb-24 md:pt-16">
        <p className="eyebrow">Walk-back self-test</p>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          Don&rsquo;t trust us. <em className="font-normal italic">Test it.</em>
        </h1>
        <p className="serif mt-8 max-w-3xl text-[clamp(1.5rem,1.1rem+1.6vw,2.5rem)] leading-[1.15]" style={{ fontWeight: 360 }}>
          {MOCK_SELF_TEST.copy.predictionLine}
        </p>
        <p className="lede mt-6 max-w-[36rem]">
          A spot is shown at its true size on your screen. Walk back until it disappears and see whether your eyes agree with the model.
        </p>
        <div className="mt-12 md:mt-16">
          <SelfTest target={MOCK_SELF_TEST.target} prediction={MOCK_SELF_TEST.prediction} copy={MOCK_SELF_TEST.copy} />
        </div>
      </div>
    </main>
  );
}
