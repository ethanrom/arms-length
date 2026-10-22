import type { MetadataRoute } from "next";

// Nothing here is meant to be found by search: the live demo is linked from the contest submission page only.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
