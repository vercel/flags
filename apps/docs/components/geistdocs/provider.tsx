"use client";

import { Analytics } from "@vercel/analytics/next";
import { GeistdocsProvider as PackageProvider } from "@vercel/geistdocs/layout";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { ComponentProps } from "react";
import { config } from "@/lib/geistdocs/config";

type GeistdocsProviderProps = Omit<
  ComponentProps<typeof PackageProvider>,
  "config"
> & {
  basePath: string | undefined;
  className?: string;
  lang?: string;
};

// Set NEXT_PUBLIC_WEB_ANALYTICS_MODE=production in .env.local to send events
// from `next dev` to the production project. The script and endpoint are only
// served from a Vercel deployment, so they have to point at the production
// domain when running locally.
const analyticsMode =
  process.env.NEXT_PUBLIC_WEB_ANALYTICS_MODE === "production"
    ? "production"
    : undefined;
const analyticsOrigin =
  analyticsMode && process.env.NODE_ENV === "development"
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined;

export const GeistdocsProvider = ({
  basePath: _basePath,
  className: _className,
  lang,
  ...props
}: GeistdocsProviderProps) => {
  return (
    <>
      <PackageProvider config={config} lang={lang} {...props} />
      <Analytics
        mode={analyticsMode}
        scriptSrc={
          analyticsOrigin
            ? `${analyticsOrigin}/_vercel/insights/script.js`
            : undefined
        }
        endpoint={
          analyticsOrigin ? `${analyticsOrigin}/_vercel/insights` : undefined
        }
      />
      <SpeedInsights />
    </>
  );
};
