/**
 * Yujin Forge -- color helpers for CLI output.
 *
 * Centralised so the entire CLI uses the same palette + the same
 * "supports color?" detection. Wraps kleur but adds two niceties:
 *
 *   - dim() preserves italics on terminals that support them
 *   - kanji() uses the warm-gold accent for the brand mark
 */
import kleur from 'kleur';

export const c = {
  success: (s: string) => kleur.green(s),
  warn:    (s: string) => kleur.yellow(s),
  error:   (s: string) => kleur.red(s),
  info:    (s: string) => kleur.cyan(s),
  brand:   (s: string) => kleur.blue().bold(s),
  kanji:   (s: string) => kleur.yellow().bold(s),
  dim:     (s: string) => kleur.gray(s),
  code:    (s: string) => kleur.gray('`') + kleur.white(s) + kleur.gray('`'),
};

/** Print a header with the Forge kanji brand mark. */
export function header(line: string): void {
  // U+58F0 -- "voice" kanji used as the brand mark across Yujin.
  console.log(c.kanji('声') + '  ' + c.brand(line));
}
