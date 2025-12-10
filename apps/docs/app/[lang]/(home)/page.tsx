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
    title: "Works with any provider",
    description: "Use any flag provider, or none at all. Flexible integrations for your projects.",
  },
  {
    id: "2",
    title: "Effortless integration",
    description: "Integrate with App Router, Pages Router, and Routing Middleware.",
  },
  {
    id: "3",
    title: "Release strategically",
    description: "Ideal for A/B testing and controlled rollouts. Experiment with confidence.",
  },
];

const HomePage = () => (
  <div className="container mx-auto max-w-5xl">
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
      <TextGridSection data={textGridSection} />
      <CenteredSection
        description="Description of centered section"
        title="Centered Section"
      >
        <div className="aspect-video rounded-lg border bg-background" />
      </CenteredSection>
      <OneTwoSection
        description="Description of one/two section"
        title="One/Two Section"
      >
        <div className="aspect-video rounded-lg border bg-background" />
      </OneTwoSection>
      <Templates
        data={templates}
        description="See Geistdocs in action with one of our templates."
        title="Get started quickly"
      />
      <CTA cta="Get started" href="/docs" title="Start your docs today" />
    </div>
  </div>
);

export default HomePage;
