import {
  type ConformanceOptions,
  conformanceChecks,
} from '@flags-sdk/conformance';
import { test } from '@playwright/test';
import { FLAGS_SECRET } from '../playwright.config';

// The conformance suite of the standard (STANDARD.md, section 11)
for (const check of conformanceChecks) {
  test(`conformance ${check.name}`, async ({ baseURL }, testInfo) => {
    const options: ConformanceOptions = {
      baseURL: baseURL as string,
      flagsSecret: FLAGS_SECRET,
      signal: true,
      manifestFile: '.next/flags-manifest.json',
      // Server components of Next.js have no URL of the request
      url: false,
    };
    test.skip(!check.applies(options), 'Does not apply');
    await check.run(options);
  });
}
