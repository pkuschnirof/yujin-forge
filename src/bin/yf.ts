#!/usr/bin/env node
/*
 * Yujin Forge CLI -- entry point.
 *
 * Each command lives in src/commands/<verb>.ts and exports a
 * `register(program)` function that attaches itself to the
 * Commander program. The entry point is intentionally thin so
 * tests can load individual commands without bootstrapping the
 * whole CLI.
 */
import { Command } from 'commander';
import { registerNewCommand } from '../commands/new.js';
import { registerMigrateCommand } from '../commands/migrate.js';
import { registerChatCommand } from '../commands/chat.js';
import { registerTestCommand } from '../commands/test.js';
import { registerShipCommand } from '../commands/ship.js';
import { registerLicenseCommand } from '../commands/license.js';
import { registerDoctorCommand } from '../commands/doctor.js';
import { registerValidateCommand } from '../commands/validate.js';
import { VERSION } from '../version.js';

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('yf')
    .description('Yujin Forge -- commercial NAC-3 React development framework.')
    .version(VERSION, '-v, --version', 'print the Forge CLI version')
    .helpOption('-h, --help', 'show help')
    .showHelpAfterError('(run "yf --help" for available commands)');

  registerNewCommand(program);
  registerMigrateCommand(program);
  registerChatCommand(program);
  registerTestCommand(program);
  registerShipCommand(program);
  registerLicenseCommand(program);
  registerDoctorCommand(program);
  registerValidateCommand(program);

  return program;
}

async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

// ESM module-detection: only invoke main when executed directly,
// not when imported by tests.
const isDirect = import.meta.url === `file://${process.argv[1]}`
  || (process.argv[1] !== undefined && import.meta.url.endsWith('/' + process.argv[1].split(/[/\\]/).pop()));

if (isDirect) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
