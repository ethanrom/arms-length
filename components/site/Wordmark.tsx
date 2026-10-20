import Link from "next/link";

/**
 * A Landolt C: the ring-with-a-gap optotype eye charts use to measure acuity. The gap is one fifth of the
 * outer diameter, as on a real chart, so the mark is itself a tiny visual-acuity target.
 */
export function LandoltMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path d="M19.745 14 A8 8 0 1 1 19.745 10" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 text-ink" aria-label="Arm's Length, home">
      <LandoltMark />
      <span className="serif text-[1.375rem] leading-none tracking-[-0.01em]" style={{ fontWeight: 420 }}>
        Arm&rsquo;s Length
      </span>
    </Link>
  );
}
