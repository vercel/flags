import { cookieFlag, exampleFlag, hostFlag } from './flags';

// Not in flags.tsx, because a module with 'use flags' exports only flags
export const precomputedFlags = [exampleFlag, hostFlag, cookieFlag];
