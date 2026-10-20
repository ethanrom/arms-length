import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Out of focus" };

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <div className="page py-20 md:py-32">
        <p className="eyebrow">Not found</p>
        <h1 className="display mt-4 max-w-4xl text-[clamp(2.6rem,1.3rem+5vw,5.5rem)]">
          That page is <em className="font-normal italic">out of focus</em>
        </h1>
        <p className="lede mt-6 max-w-[34rem]">We could not find what you were looking for. The demo faces are a good place to start.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/try" className="btn btn-primary">
            Choose a demo face <span className="arrow" aria-hidden="true">&rarr;</span>
          </Link>
          <Link href="/" className="btn btn-ghost">
            Back to the start
          </Link>
        </div>
      </div>
    </main>
  );
}
