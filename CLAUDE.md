# CLAUDE.md

This file gives Claude Code the context to make useful
contributions to `pkuschnirof/yujin-forge`.

## What this repo is

Yujin Forge is the commercial layer of the Yujin / NAC ecosystem:
a React development framework with NAC-3 baked in and Claude Code
embedded. Spec in `docs/SPEC.md`. Charter in `README.md`.

**Day-0 status (2026-05-10):** planning + branding anchor only.
No production code yet. Implementation kickoff after NAC v2.3 GA.

## What lives where (today)

- **NAC spec + reference runtime + npm package:**
  `pkuschnirof/rpaforce-crm` (the Yujin CRM repo, where NAC was
  incubated and still lives canonically).
- **Yujin framework planning + brownfield migration recipe:**
  `pkuschnirof/yujin`.
- **Yujin Forge (this repo):** product spec for the commercial
  React-shaped delivery.

If asked to make code changes during day 0, do them in the
appropriate upstream repo and document them here.

## Style + conventions

- ASCII-only markdown (cross-linked with rpaforce-crm which
  deploys to GoDaddy PHP 8.3 with ASCII-only constraints).
- Commit messages: imperative, under 70 chars, body explains why.
  Co-author trailer welcome:
  `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- License is in flux (see LICENSE). Until commercial license
  lands, every contribution stays Apache-2.0.

## What you can rely on

- Same PAT as `pkuschnirof/rpaforce-crm` (per
  `pkuschnirof/rpaforce-crm:docs/SESSION_HANDOVER_CREW_AND_REPO.md`).
- NAC spec at v2.2 stable. v2.3 preview lives in
  `feat/nac-interop-mcp` branch of rpaforce-crm; Forge will track
  v2.3 once GA.
- Yujin parent license server reference: `license.yujin.dev`
  (TBD; not yet stood up).

## What you should NOT do without owner approval

- Do not write production code in this repo during day 0.
  Implementation kickoff is gated on NAC v2.3 GA.
- Do not register the `@yujin/forge` npm scope from this repo
  until the v1.0 launch.
- Do not change `LICENSE` -- the commercial license shape needs
  Pablo's sign-off.
- Do not auto-mirror code from rpaforce-crm.

## Useful starting points

- `README.md` -- product pitch + ecosystem placement.
- `docs/SPEC.md` -- the contract Forge makes with adopting teams.
- Upstream NAC spec:
  https://yujin.app/nac-spec/SPEC.md
- Yujin framework charter:
  https://github.com/pkuschnirof/yujin
