/**
 * Error thrown when the fallback definitions file does not exist.
 * This typically means the "vercel-flags prepare" command was not run before building.
 */
export class FallbackNotFoundError extends Error {
  constructor() {
    super('@vercel/flags-core: Bundled definitions file not found.');
    this.name = 'FallbackNotFoundError';
  }
}

/**
 * Error thrown when the fallback definitions file exists but has no entry for the SDK key.
 * This means the SDK key was not included when running "vercel-flags prepare".
 */
export class FallbackEntryNotFoundError extends Error {
  constructor() {
    super('@vercel/flags-core: No bundled definitions found for SDK key.');
    this.name = 'FallbackEntryNotFoundError';
  }
}
