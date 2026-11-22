#!/usr/bin/env node
/**
 * The command line of the Flags SDK. See `commands.ts`.
 */
import { runCommand } from './commands';

runCommand(process.argv.slice(2)).then(
  (message) => {
    // flags format --stdin writes its own output
    if (message !== '') {
      console.log(message);
    }
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
