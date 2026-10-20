import Link from "next/link";
import { LandoltMark } from "./Wordmark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr] md:py-16">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <LandoltMark size={18} />
            <span className="serif text-lg" style={{ fontWeight: 420 }}>
              Arm&rsquo;s Length
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            What others can actually see of your skin, and from how far. Distances, not scores.
          </p>
        </div>

        <nav aria-label="Footer">
          <h2 className="eyebrow">Explore</h2>
          <ul className="mt-4 space-y-2 text-[0.9375rem]">
            <li>
              <Link href="/try" className="link">
                Try a demo face
              </Link>
            </li>
            <li>
              <Link href="/self-test" className="link">
                Walk-back self-test
              </Link>
            </li>
            <li>
              <Link href="/how-it-works" className="link">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/for-brands" className="link">
                For brands
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="eyebrow">Good to know</h2>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">
            Demo faces are synthetic (AI-generated). Nobody real is shown.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Skin analysis by YouCam. Vision model by us. Not a medical tool.
          </p>
        </div>
      </div>
    </footer>
  );
}
