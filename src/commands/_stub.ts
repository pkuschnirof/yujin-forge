/**
 * Helper for day-0 command stubs. Prints a friendly "not
 * implemented" message + exits with code 0 so CI doesn't fail.
 *
 * When a command lands its real implementation, swap stub() for
 * the actual body. The signature stays the same -- Commander
 * forwards options + the program instance.
 */
import { c, header } from '../ui/colors.js';

export function stub(verb: string, plannedFor: string): void {
  header('Yujin Forge -- ' + verb);
  console.log('');
  console.log(c.warn('Not implemented yet.') + ' Planned for ' + c.dim(plannedFor) + '.');
  console.log('');
  console.log('This is the day-0 CLI scaffold. The ' + c.code(verb) + ' command is');
  console.log('wired into Commander so options + help text are real, but the');
  console.log('handler is a placeholder until the corresponding milestone.');
  console.log('');
  console.log(c.dim('See docs/SPEC.md section 8 for the full roadmap.'));
}
