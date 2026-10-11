'use flags';

import { defineFlag } from 'flags';

// No connection: the flags use the default connection of flags.config.ts
export const greeting = defineFlag('greeting', 'Hi');
export const darkMode = defineFlag('dark-mode');
