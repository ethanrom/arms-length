import Link from "next/link";
import { DISCLAIMERS } from "@/lib/copy/disclaimers";
import { LandoltMark } from "./Wordmark";

/** The same footer on every page, so the Help link sits in the same place everywhere (WCAG 3.2.6 Consistent Help). */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="page grid gap-10 py-12 md:grid-cols-2 md:py-16 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <LandoltMark size={18} />
            <span className="serif text-lg" style={{ fontWeight: 420 }}>
              Arm&rsquo;s Length
            </span>
          </div>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
            What others can actually see of your skin, and from how far. Distances, not scores.
          </p>
        </div>

        <nav aria-label="Footer">
          <h2 className="eyebrow">Explore</h2>
          <ul className="mt-4 space-y-1 text-[0.9375rem]">
            <li>
              <Link href="/try" className="link inline-block py-1">
                Try a demo face
              </Link>
            </li>
            <li>
              <Link href="/self-test" className="link inline-block py-1">
                Walk-back self-test
              </Link>
            </li>
            <li>
              <Link href="/how-it-works" className="link inline-block py-1">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/for-brands" className="link inline-block py-1">
                For brands
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Help and privacy">
          <h2 className="eyebrow">Help</h2>
          <ul className="mt-4 space-y-1 text-[0.9375rem]">
            <li>
              <Link href="/privacy" className="link inline-block py-1">
                Privacy notice
              </Link>
            </li>
            <li>
              <Link href="/privacy#help" className="link inline-block py-1">
                Help and contact
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="eyebrow">Good to know</h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
            Built on YouCam HD Skin Analysis, Skin Simulation and Makeup VTO. The vision model is ours.
          </p>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">Demo faces are synthetic (AI-generated). Nobody real is shown.</p>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted">{DISCLAIMERS.notHealth}</p>
        </div>
      </div>
    </footer>
  );
}
