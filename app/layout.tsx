import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/site/Providers";
import { SiteHeader, SiteHeaderStatic } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial serif for headlines. The optical-size axis lets large type tighten and small type open up.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Arm's Length: what others can actually see of your skin",
    template: "%s · Arm's Length",
  },
  description:
    "You judge your skin in a mirror at 25 cm. Everyone else sees it from a metre or more. Arm's Length shows what others can actually see, and from how far.",
  // The live demo is linked from the submission page only; keep it out of search results (see also app/robots.ts).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f5f3ef",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>
          <Suspense fallback={<SiteHeaderStatic />}>
            <SiteHeader />
          </Suspense>
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
