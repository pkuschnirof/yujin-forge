# Yujin Forge -- Commercial plan + execution backlog

**Status:** decided 2026-05-11. Not executed yet.
**Sibling repo:** `yujin-pilot` ships under the same plan; see
that repo's `docs/COMMERCIAL_PLAN.md` for the demand side.

This document is the source of truth for the business model,
pricing, packaging, and execution backlog of Yujin Forge. Any
change must update this file in the same commit.

---

## The model in one paragraph

Yujin Forge is a paid IDE/framework ($19/mo, BYOK) where every
app the dev builds is automatically NAC3-compliant. The dev pays
for the tooling -- guided AI setup, multi-provider routing,
prompt caching, token-aware UI, scaffolding, `forge publish` --
not for AI consumption. AI tokens flow through the dev's own
Claude / OpenAI / Gemini account. Forge subscribers get Pilot
bundled free.

The pair Forge + Pilot is necessary, not marketing. Pilot alone
has nothing to control because NAC3 apps barely exist today.
Forge is the supply engine that fixes that. Forge carries the
revenue load; Pilot is the moat enforcer + the public-facing
demo of "look what Forge-built apps do".

---

## Pricing tiers

| Tier | Price | Trial | Support | What you get |
|------|-------|-------|---------|--------------|
| Forge Free | $0 | -- | GitHub issues only | NAC3 spec MIT core, basic scaffolder, no multi-provider router, no cache, no token-aware UI, no `forge publish` |
| Forge Pro | $19/mo | 14 days | Email + GitHub issues | Everything: setup wizard, multi-provider router, prompt cache, token-aware UI, `forge publish`, "convert existing app" mode, Pilot Pro bundled free |

**No managed-key tier in v1.** Math: a single active dev burns
~$200/mo of Claude Code; managed key would require pricing at
$250+ to keep a margin. Will revisit at $10k MRR with bulk-rate
Anthropic Scale Plan access.

## Trial -> degradation

After 14 days unpaid, Forge does NOT block launch. It:

- Disables `forge publish`.
- Disables multi-provider router (falls back to Claude only).
- Disables prompt caching layer (raw API calls only).
- Disables token-aware pre-action cost estimator.
- Shows a dismissible banner: "Trial expired -- sostener el
  desarrollo en {polar_link}".

The dev can keep using the open-core features indefinitely. We
push to convert via value loss, not via UI lockout. Reason:
audience is technical; a blocking modal gets patched in 10
minutes.

## BYOK policy (canonical text)

> Yujin Forge is BYOK (bring your own key). You pay Anthropic,
> OpenAI, or Google directly for AI usage. We never see your
> tokens. The subscription covers the tooling -- guided setup,
> multi-provider routing, prompt caching, token-aware UI, app
> registry publishing, and the Forge codegen experience. It does
> not cover AI consumption.
>
> Why: AI API pricing changes monthly. We refuse to charge a
> markup that fluctuates with someone else's pricing.

This text must appear verbatim in: README, pricing page,
setup-wizard step 1, EULA.

## Open core line

| Lives in MIT nac-spec | Lives in private yujin-forge repo |
|----------------------|-----------------------------------|
| NAC3 spec | The Forge IDE shell |
| Reference runtime (`nac.js`, `nac-chat-client.js`, `nac-mcp-interop.js`) | Setup wizard |
| Reference demos | Multi-provider router |
| Validator CLI (`npx @yujin/nac validate`) | Prompt cache layer |
| Adoption guides | Token-aware UI |
| AI playbooks | `forge publish` |
| | Scaffolding templates with NAC3 codegen |
| | "Convert existing app" mode |
| | Auto-update + telemetry |

If a feature is not on either column, it does not exist yet.

---

## Execution backlog (decided, not started)

Tracks A through F below mirror the tasks in the Yujin internal
task tracker (IDs in brackets).

### A. Strategy + commercial framing

- [A1] `docs/COMMERCIAL_PLAN.md` (this file). [DONE]
- [A2] Trial structure + graceful degradation policy doc.
- [A3] Open-core line drawn in each product README.
- [A4] BYOK token policy block in product README + landing.

### B. Forge product MVP

- [B1] First-run BYOK setup wizard (4 steps).
- [B2] Multi-provider router (Claude / OpenAI / Gemini / local).
- [B3] Anthropic Prompt Caching + local response cache.
- [B4] Token-aware UI: pre-action cost estimate + dashboard.
- [B5] NAC3-compliant scaffolding by default.
- [B6] `forge convert <repo>` -- migration playbook automation.
- [B7] `forge publish` -- one-shot submit to NAC3 registry.

### C. Pilot integration (lives in yujin-pilot repo)

- [C1] Pilot registry browser.
- [C2] Pairing flow (open / oauth / api_key).
- [C3] Voice + chat dispatch to paired apps.
- [C4] .well-known/nac3-manifest.json manual paste.

### D. Registry infrastructure (lives in yujin.app)

- [D1] DB schema + backend.
- [D2] Submission endpoint + DNS verify.
- [D3] List endpoint + i18n + CDN cache.
- [D4] GitHub topic `nac3-compliant` seeder cron.
- [D5] Moderation queue UI + verified badge.
- [D6] Public landing page yujin.app/registry.

### E. Supply bootstrap

- [E1] yujin-CRM as NAC3 day-1 reference.
- [E2] Seed bounty program ($5k budget).

### F. Payments + legal

- [F1] Polar.sh setup for Forge + Pilot products.
- [F2] License key + offline activation flow.
- [F3] EULA + Privacy + ToS texts.
- [F4] Anthropic affiliate check.

---

## Sequencing

1. Track A (commercial framing) is free -- decisions only, no
   code. Lock it before any other track starts.
2. Tracks D + E in parallel: registry infra (D) is shared
   between Forge + Pilot, supply bootstrap (E) feeds the
   registry. Both must be live before launch makes sense.
3. Track B (Forge product) ships in slices. Order: B1 (wizard)
   -> B5 (scaffolding) -> B7 (publish) -> B2/B3/B4 (router +
   cache + token UI). Last three justify the $19/mo headline
   but are not blockers for first usable dogfood.
4. Track F (payments) blocks launch but not dogfood; ship F1 +
   F2 right before public release.
5. Track C (Pilot) is in the sibling repo; coordinate via the
   shared registry schema (D1).

---

## What we deliberately did NOT do

- No managed-key tier. Token economics don't allow it at our
  scale.
- No blocking modal at trial expiry. Audience is technical; the
  modal would be patched out within hours.
- No per-token markup. Same reason as managed-key.
- No Stripe in v1. Polar covers the dev audience with less
  overhead.
- No multi-product launch from a single brand at once. Forge
  leads on revenue; Pilot rides bundled.

## See also

- `yujin-pilot/docs/COMMERCIAL_PLAN.md` -- the demand side.
- `nac-spec/SPEC.md` -- the protocol that makes both products
  necessary.
- `nac-spec/guides/AI_PLAYBOOK_MIGRATION.md` -- what `forge
  convert` automates.

## License

This document is published under CC-BY-4.0. The code it
describes is split: nac-spec MIT/Apache; yujin-forge proprietary.
