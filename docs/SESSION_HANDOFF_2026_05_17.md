# Yujin Forge -- overnight handoff (2026-05-17)

Session goal: implementation kickoff for Yujin Forge after the
day-0 charter. Pablo authorised "avanza toda la noche, decide
tú, no frenes".

## TL;DR

Yujin Forge went from **planning documents only** to a **working
CLI with 8 commands, 74 tests green, full publish-ready ESM
package**. The end-to-end lifecycle works:

    yf new my-app           ->   scaffold a NAC-3 React app
    yf migrate <repo> --audit ->  free, read-only inventory
    yf migrate <repo> --apply  -> paid, byte-preserving AST edits
    yf validate .           ->   pre-commit structural gate
    yf test                 ->   route to npm test
    yf ship                 ->   gate (validate -> license -> test -> build)
    yf license activate     ->   install a paid seat (JWT shape)
    yf doctor               ->   env + license health

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

## What's still stubbed

- `yf chat` -- the voice + chat panel. Big slice: needs the
  Claude Agent SDK, a local server, WebSocket bridge for the
  panel, voice STT/TTS. Day-0 stub still prints the milestone
  message.
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

74 cases across 9 files:

- `tests/license.test.ts` -- trial lifecycle (5)
- `tests/activate.test.ts` -- paid seat + JWT parse + revoke (13)
- `tests/template.test.ts` -- scaffolder + tokens + slug check (17)
- `tests/cli.test.ts` -- program shape + json contracts (5)
- `tests/migrate-audit.test.ts` -- AST walker (8)
- `tests/migrate-apply.test.ts` -- AST-positioned edits (8)
- `tests/validate.test.ts` -- structural project check (9)
- `tests/ship.test.ts` -- gate orchestration with injected exec (7)
- `tests/test-command.test.ts` -- yf test routing (2)

`npm test` runs them all in ~2 seconds.

## Next slices, in suggested order

1. **`yf generate tests`** -- emit Vitest tests from a manifest.
   Highest value-density; closes the "Forge writes the test
   corpus" pitch from the SPEC.
2. **Manifest deep-validator** -- parse `src/nac/manifest.ts` via
   AST + verify label_i18n has all 10 NAC locales. Pre-commit
   gold.
3. **Mock generator** -- given a network surface inferred from
   `fetch`/`axios` calls, emit MSW handlers. Heaviest; requires
   the @yujin/nac runtime to publish first so the mock contract
   has shapes to assert against.
4. **`yf chat` voice + text panel** -- the big one. Plan it as a
   2-week slice, not a 2-hour slice. Spec is in
   `docs/SPEC.md` section 5.

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
