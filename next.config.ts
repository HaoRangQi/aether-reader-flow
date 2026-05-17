import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Hide the Next.js dev tools indicator (bottom-left floating dot).
   * This is purely a dev-time UI — it never appears in `next build`/`next start`
   * production output. Disabling here keeps the dev experience uncluttered
   * and avoids confusion with our own settings panel.
   */
  devIndicators: false,
};

export default nextConfig;
