import type { StaticImageData } from 'next/image';
import type { ReactNode, SVGProps } from 'react';
import adaptable from './illustrations/adaptable.svg';
import effortless from './illustrations/effortless.svg';
import flexible from './illustrations/flexible.svg';

type IllustrationProps = SVGProps<SVGSVGElement> & {
  children?: ReactNode;
  source: StaticImageData;
  title: string;
};

// The artwork lives in static SVG files so the homepage HTML stays small.
// Theme tokens still apply to shapes because CSS custom properties inherit
// into the shadow tree that <use> creates. Paint servers (gradients, masks)
// resolve in the external file instead, so anything that needs a token in a
// gradient has to stay inline as children.
const Illustration = ({
  children,
  source,
  title,
  ...props
}: IllustrationProps) => (
  <svg
    width="307"
    height="200"
    viewBox="0 0 307 200"
    fill="none"
    role="img"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>{title}</title>
    <use href={`${source.src}#illustration`} />
    {children}
  </svg>
);

export const Flexible = (props: SVGProps<SVGSVGElement>) => (
  <Illustration
    source={flexible}
    title="Flags SDK works with any provider"
    {...props}
  />
);

export const Adaptable = (props: SVGProps<SVGSVGElement>) => (
  <Illustration
    source={adaptable}
    title="An A/B test on a webpage"
    {...props}
  />
);

export const Effortless = (props: SVGProps<SVGSVGElement>) => (
  <Illustration
    source={effortless}
    title="Next.js easily supports feature flags"
    {...props}
  >
    <rect
      x="243"
      y="308.5"
      width="344"
      height="64"
      transform="rotate(-90 243 308.5)"
      fill="url(#effortless-fade)"
    />
    <defs>
      <linearGradient
        id="effortless-fade"
        x1="464.5"
        y1="361"
        x2="464.5"
        y2="309.5"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="var(--ds-background-200)" />
        <stop offset="1" stopColor="var(--ds-background-200)" stopOpacity="0" />
      </linearGradient>
    </defs>
  </Illustration>
);
