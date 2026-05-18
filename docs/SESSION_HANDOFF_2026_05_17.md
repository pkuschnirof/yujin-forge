# Yujin Forge -- overnight handoff (2026-05-17)

Session goal: implementation kickoff for Yujin Forge after the
day-0 charter. Pablo authorised "avanza toda la noche, decide
tú, no frenes" + later "por favor continúa a finalizar.
Acuérdate, chat con 3 modos".

## TL;DR

Yujin Forge went from **planning documents only** to a **working
CLI with 8 commands, 97 tests green, full publish-ready ESM
package, plus a local HTTP server with a 3-mode browser chat
panel**. The end-to-end lifecycle works:

    yf new my-app             -> scaffold a NAC-3 React app
    yf migrate <repo> --audit -> free, read-only inventory
    yf migrate <repo> --apply -> paid, byte-preserving AST edits
    yf validate .             -> pre-commit structural gate
    yf test                   -> route to npm test
    yf ship                   -> gate (validate -> license -> test -> build)
    yf chat                   -> local server + 3-mode browser panel
    yf license activate       -> install a paid seat (JWT shape)
    yf doctor                 -> env + license health

Trial mode works offline. Paid-seat mode persists
`~/.yujin-forge/license.json` with machine fingerprint.

## Commits, in order

| Hash | Title |
|---|---|
| `02069cd` | bootstrap CLI skeleton + trial-mode license client |
| `33cfac5` | react-app starter + CI matrix (Node 18/20/22) |
| `ad77f64` | real implementation of `yf new <slug>` |
| `c6738b6` | real activate + revoke flow + JWT parser + fingerprint |
| `abe2d07` | `yf migrate <repo> --audit` AST walker + report |
| `117ccf3` | `yf migrate <repo> --apply` -- byte-preserving AST edits |
| `12fa2c6` | `yf validate [path]` -- static project structure check |
| `1b1d941` | real `yf ship` gate (validate -> license -> test -> build) |
| `a3dcf72` | `yf test` real impl -- shells to npm test with routing |
| `23b6f0b` | handoff doc -- this file (interim) |
| `a4cce6b` | flip README + CLAUDE.md from day-0 to CLI-alpha |
| `53b6387` | `yf chat` real -- local server + 3-mode browser panel |

Each commit ships green tests + a smoke verification noted in
the commit body.

## What works end-to-end tonight

1. `npm install` at the repo root, then `npx tsx src/bin/yf.ts --help`.
2. **Scaffold:** `yf new my-app --dir /tmp/my-app` -> 11-file React
   starter under `/tmp/my-app/`, tokens substituted, license_ref
   stamped, next-steps printed.
3. **Audit existing project:** `yf migrate /tmp/my-app --audit`
   reports candidates classified as action / field / region,
   flags already-tagged elements, derives `proposed_id` from
   file path + role.
4. **Apply migration:** `yf license activate --key <jwt>` ->
   `yf migrate /tmp/my-app --apply` -> data-nac-id added in
   place, idempotent on second run, byte-preserving outside
   insertions.
5. **Validate:** `yf validate /tmp/my-app` -> green.
6. **Ship gate:** `yf ship --cwd /tmp/my-app --skip-tests` ->
   validate clean / license / test skipped / build (currently
   fails because @yujin/nac is unpublished -- the gate is doing
   its job).
7. **Chat:** `yf chat --cwd /tmp/my-app` -> server on
   http://127.0.0.1:4847/ -> open in a browser -> click the
   "侑" globito bottom-right -> chat with Claude. Transcripts
   land in `.yujin-forge/cache/chat/<stamp>.json` inside the
   project. Set `YUJIN_ANTHROPIC_API_KEY` env (or drop a key
   into `~/.yujin-forge/api-key.txt`) before opening, otherwise
   /api/chat returns 503 no_api_key.

## What's still stubbed

- **Voice STT/TTS inside `yf chat`** -- the panel ships the mic
  button as visibly disabled with a "Voz disponible en v1.0"
  tooltip. Lights up when @yujin/nac v2.3 publishes the audio
  primitives the panel will consume.
- **Tool-use loop** -- chat is conversational only today. The
  `forge.read_manifest` / `forge.write_component` /
  `forge.run_tests` / `forge.run_migration_step` /
  `forge.consult_nac_spec` tools from SPEC 4.2 are not wired
  yet. When they land, the chat will actually edit code in
  place. Likely a 1-2 day slice once we decide the approval-
  flow UX.
- `yf generate tests` -- the auto-test-corpus emitter. Not yet
  a registered command. Will live next to the migrate apply
  module.

## Known gaps to address

- **The starter template imports `@yujin/nac` which is not
  published to npm yet.** Cloning a new project + `npm install`
  works, but `npm run build` fails on the missing module. The
  ship gate correctly surfaces this. Two fixes for the future:
  (a) publish a stub @yujin/nac to unblock typecheck, or
  (b) vendor a local shim file inside the template that gets
  swapped for the real dep at v1.0 GA.
- **Server-side license verification is missing.** `yf license
  activate` parses the JWT shape only; the signature is not
  verified. When `license.yujin.dev` publishes its public key,
  add a verify step in `src/license/activate.ts` and a 24h
  refresh in `src/license/index.ts::loadLicense`.
- **CI template-smoke job is disabled.** See
  `.github/workflows/ci.yml` -- re-enable once @yujin/nac is on
  npm.

## Tests

97 cases across 12 files:

- `tests/license.test.ts` -- trial lifecycle (5)
- `tests/activate.test.ts` -- paid seat + JWT parse + revoke (13)
- `tests/template.test.ts` -- scaffolder + tokens + slug check (17)
- `tests/cli.test.ts` -- program shape + json contracts (5)
- `tests/migrate-audit.test.ts` -- AST walker (8)
- `tests/migrate-apply.test.ts` -- AST-positioned edits (8)
- `tests/validate.test.ts` -- structural project check (9)
- `tests/ship.test.ts` -- gate orchestration with injected exec (7)
- `tests/test-command.test.ts` -- yf test routing (2)
- `tests/chat-claude.test.ts` -- API key chain + envelope + errors (8)
- `tests/chat-persistence.test.ts` -- transcript store (7)
- `tests/chat-server.test.ts` -- server routes + 503/502 mapping (8)

`npm test` runs them all in ~2.3 seconds.

## Next slices, in suggested order

1. **Chat tool-use loop** -- give the chat real powers. The
   tool catalog from SPEC 4.2 (read_manifest, write_component,
   run_tests, run_migration_step, consult_nac_spec) plus the
   Anthropic tool_use protocol. This is the differentiator that
   makes Forge feel like "Claude embedded" instead of "Claude
   chat embedded".
2. **`yf generate tests`** -- emit Vitest tests from a manifest.
   Pure utility; closes the "Forge writes the test corpus"
   pitch.
3. **Manifest deep-validator** -- parse `src/nac/manifest.ts` via
   AST + verify label_i18n has all 10 NAC locales. Pre-commit
   gold.
4. **Voice STT/TTS in chat** -- the mic button is rendered
   disabled today. Waits on @yujin/nac v2.3 publishing the
   audio primitives.
5. **Mock generator** -- given a network surface inferred from
   `fetch`/`axios` calls, emit MSW handlers. Heaviest; requires
   the @yujin/nac runtime to publish first.

## Notes for Pablo

- Repo is at `pkuschnirof/yujin-forge`. Same PAT scheme as
  rpaforce-crm + yujin-koe.
- Lockfile (package-lock.json) is committed -- diff with the
  CI matrix in mind (Node 18.20 / 20.x / 22.x all install
  cleanly).
- `npm run build` produces `dist/` with .js + .d.ts +
  sourcemaps. Publish-ready (run `npm publish --access public`
  on a fresh tag after the first license server pass).
- The `~/.yujin-forge/` directory is the only writable side-
  effect the CLI has. Trial.json there is what was used during
  the smoke tests; remove the dir to reset.

The lights stay on. Decide tomorrow which slice to pull next.
