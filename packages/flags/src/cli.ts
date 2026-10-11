#!/usr/bin/env node
/**
 * The command line of the Flags SDK. See `commands.ts`.
 */
import { runCommand } from './commands';

runCommand(process.argv.slice(2)).then(
  (message) => console.log(message),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
