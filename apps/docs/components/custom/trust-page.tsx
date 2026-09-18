import Link from 'next/link';
import { getLocalizedPath } from '@/lib/geistdocs/public-path';
import type { TrustPage } from '@/lib/site/trust-pages';

export const TrustPageContent = ({
  lang,
  page,
}: {
  lang: string;
  page: TrustPage;
}) => (
  <main className="mx-auto grid w-full max-w-2xl gap-10 px-6 pt-(--fd-nav-height) pb-32">
    <header className="grid gap-3 pt-16">
      <h1 className="font-[450] text-4xl tracking-tight">{page.title}</h1>
      <p className="text-gray-900 text-lg">{page.description}</p>
    </header>
    {page.sections.map((section) => (
      <section key={section.heading} className="grid gap-3">
        <h2 className="text-heading-20">{section.heading}</h2>
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-gray-900 leading-relaxed">
            {paragraph}
          </p>
        ))}
        {section.links ? (
          <ul className="grid gap-2">
            {section.links.map((link) => {
              const isInternal = link.href.startsWith('/');
              const href = isInternal
                ? getLocalizedPath(lang, link.href)
                : link.href;
              return (
                <li key={link.href}>
                  <Link
                    className="underline"
                    href={href}
                    prefetch={isInternal ? true : undefined}
                    rel={isInternal ? undefined : 'noopener'}
                  >
                    {link.label}
                  </Link>
                  <span className="text-gray-900"> — {link.description}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    ))}
  </main>
);
