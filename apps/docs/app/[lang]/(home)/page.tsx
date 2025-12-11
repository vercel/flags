import DynamicLink from "fumadocs-core/dynamic-link";
import type { Metadata } from "next";
import { Installer } from "@/components/geistdocs/installer";
import { Button } from "@/components/ui/button";
import { CenteredSection } from "./components/centered-section";
import { CTA } from "./components/cta";
import { Hero } from "./components/hero";
import { OneTwoSection } from "./components/one-two-section";
import { Templates } from "./components/templates";
import { TextGridSection } from "./components/text-grid-section";
import Testimonials from "./components/testimonials";
import { Demo } from "./components/demo";
import HeroImage from "./components/hero-image";
import { Adaptable, Effortless, Flexible } from "./components/illustrations";
import { FlagsConfig } from "./components/flags-config";
import { FlagValues } from "flags/react";
import { enableBannerFlag, enableDitheredHeroFlag, enableHeroTextFlag, rootFlags } from "./components/flags";

const title = "Ship faster with feature flags";
const description = "Flags SDK is a free, open-source library for using feature flags in Next.js and SvelteKit.";

export const metadata: Metadata = {
  title,
  description,
};

const templates = [
  {
    title: "Shirt Shop Example",
    description: "A simple example of using Flags SDK to implement feature flags in a shirt shop.",
    link: "https://github.com/vercel/flags/tree/main/examples/shirt-shop",
    image: "https://placehold.co/600x400.png",
  },
  {
    title: "Snippets",
    description: "A collection of example snippets for the Flags SDK.",
    link: "https://github.com/vercel/flags/tree/main/examples/snippets",
    image: "https://placehold.co/600x400.png",
  },
  {
    title: "SvelteKit Example",
    description: "A simple example of using Flags SDK in SvelteKit.",
    link: "https://github.com/vercel/flags/tree/main/examples/sveltekit-example",
    image: "https://placehold.co/600x400.png",
  },
];

const textGridSection = [
  {
    id: "1",
    image: <Flexible />,
    title: "Works with any provider",
    description: "Use any flag provider, or none at all. Flexible integrations for your projects.",
  },
  {
    id: "2",
    image: <Effortless />,
    title: "Effortless integration",
    description: "Integrate with App Router, Pages Router, and Routing Middleware.",
  },
  {
    id: "3",
    image: <Adaptable />,
    title: "Release strategically",
    description: "Ideal for A/B testing and controlled rollouts. Experiment with confidence.",
  },
];

type HomePageProps = {
  params: Promise<{ code: string }>;
};

const HomePage = async ({ params }: HomePageProps) => {
  const { code } = await params;
  const [bannerFlag, ditheredHeroFlag, heroTextFlag] = await Promise.all([
    enableBannerFlag(code, rootFlags),
    enableDitheredHeroFlag(code, rootFlags),
    enableHeroTextFlag(code, rootFlags),
  ]);

  return (
    <div className="container mx-auto max-w-5xl">
      <FlagValues
        values={{
          [enableBannerFlag.key]: bannerFlag,
          [enableDitheredHeroFlag.key]: ditheredHeroFlag,
          [enableHeroTextFlag.key]: heroTextFlag,
        }}
      />
      <Hero
        description={description}
        title={title}
      >
        <div className="mx-auto inline-flex w-72 items-center gap-3">
          <Button asChild className="px-4" size="lg">
            <DynamicLink href="/[lang]/docs/getting-started">
              Get Started
            </DynamicLink>
          </Button>
          <Installer command="npm i flags" />
        </div>
      </Hero>
      <div className="grid divide-y border-y sm:border-x">
        <OneTwoSection
          description="The SDK sits between your application and the source of your flags, helping you follow best practices and keep your website fast."
          title="Using flags as code"
        >
          {ditheredHeroFlag ? (
            <HeroImage />
          ) : null}
          <FlagsConfig />
        </OneTwoSection>
        <TextGridSection data={textGridSection} />
        <CenteredSection
          description="With a simple declarative API to define and use your feature flags."
          title="Effortless setup"
        >
          <Demo />
        </CenteredSection>
        <Testimonials />
        <Templates
          data={templates}
          description="See Geistdocs in action with one of our templates."
          title="Get started quickly"
        />
        <CTA cta="Get started" href="/docs" title="Start your docs today" />
      </div>
    </div>
  );
};

export default HomePage;
