# Yujin Forge -- product specification (draft)

**Version:** 0.0.1-draft
**Status:** day-0 planning. NOT YET IMPLEMENTED.
**Owner:** Yujin (rpaforce.com)
**Builds on:** NAC v2.3 GA (forthcoming).

---

## 0. Mission

Yujin Forge takes a developer from "I want a NAC-3 React app" or
"I want to migrate my React app to NAC-3" to a working,
production-quality artefact in less than a day -- with Claude
Code doing the typing, the developer doing the judgement, and
the framework enforcing conformance.

## 1. The Forge object lifecycle

```
+---------------+
|  yf new       |  user describes feature in chat / voice
|  yf migrate   |  OR uploads an existing repo
+---------------+
       |
       v
+---------------+
| project       |  framework-shaped: data-nac-* everywhere,
| materialised  |  manifests registered, license token stamped
+---------------+
       |
       v
+---------------+
| yf chat       |  Claude Code embedded. Voice + text. Reads
| (iterates)    |  + writes source. Proposes changes; user
|               |  approves; commits.
+---------------+
       |
       v
+---------------+
| yf test       |  Auto-generated:
|               |   - per-component NAC contract test
|               |   - per-action ack expectation
|               |   - per-route Playwright e2e
|               |   - MSW mocks for every network surface
+---------------+
       |
       v
+---------------+
| yf ship       |  Gate: tests green + validate clean + license
|               |  valid -> static deploy / docker / serverless
+---------------+
```

## 2. License gating

### 2.1 Trial

- 30 days from first `yf new` or `yf chat`.
- Watermark in every generated file ("Yujin Forge -- trial").
- `yf ship` refuses; produces a `dist/` but blocks the publish
  step.
- The user CAN keep iterating locally indefinitely with the
  watermark.

### 2.2 Paid seat

- Issued by the parent Yujin license server (`license.yujin.dev`,
  TBD).
- Stored in `~/.yujin-forge/license.json`. Validated against the
  server every 24h; cached offline up to 7 days.
- Bound to (machine fingerprint OR email). Org plans allow N
  active seats.
- Revocation: when the parent revokes a token, the local cache
  expires within the next 24h check. Forge falls back to trial
  semantics.

### 2.3 What stays free even without a license

- The migration audit (`yf migrate --audit`) -- it produces a
  report but does NOT mutate the project.
- The voice + chat panel without Forge-specific tools (i.e.
  vanilla Claude Code as if the user installed it themselves).
- The CLI scaffolder for an empty template (the template itself
  is Apache-2.0).

### 2.4 What requires a paid seat

- Auto-generated test corpus per-screen.
- Auto-generated mock layer (MSW handlers + fixtures).
- Voice-driven scaffolder ("add a new Customer screen with these
  fields").
- Migration EXECUTION (`yf migrate --apply`).
- Embedded Claude Code with NAC-aware tools.
- `yf ship` deploy gate.

## 3. NAC-3 commercial build

The vanilla `@yujin/nac` package is Apache-2.0. Yujin Forge ships
a commercial fork named `@yujin/nac-commercial` that:

- Tracks every NAC stable release within 24h.
- Adds AI-augmented manifest authoring (the runtime emits
  manifest suggestions back to the chat).
- Adds the `auto_mock` primitive: when a component's network
  surface changes, the runtime emits an event that Forge's mock
  generator listens to.
- Adds metered usage telemetry (callable verbs / actual
  dispatches / ack times) reported back to the parent
  for billing + product metrics.
- License-key validated at runtime; refuses to start commercial
  features without a valid token.

## 4. Architecture

### 4.1 CLI

```
yf <command>
  new       -- scaffold from template
  migrate   -- audit + optionally apply
  chat      -- launch voice + chat panel
  test      -- run full suite
  ship      -- gated deploy
  license   -- activate / status / revoke
  doctor    -- env + project health
```

Implementation: TypeScript + Node 18+. No native binary in v1.0;
distributed as `@yujin/forge-cli` on npm (paid registry).

### 4.2 Claude Code embedding

Forge does NOT vendor Claude Code's source. It calls the official
[Claude Agent SDK](https://docs.anthropic.com/) via Node, passing
a workspace-specific tool catalogue:

- `forge.read_manifest(plugin_slug)` -- introspection.
- `forge.write_component(path, source)` -- gated by user approval
  in the chat UI.
- `forge.run_tests(pattern)` -- exec Vitest / Playwright.
- `forge.run_migration_step(step_id)` -- atomic AST mutation.
- `forge.consult_nac_spec(query)` -- RAG over the SPEC.md.

Voice: STT via Google Cloud (key in Yujin's central config). TTS
via ElevenLabs. Both billed through the seat license.

### 4.3 Project structure

```
my-app/
  package.json              # depends on @yujin/forge + @yujin/nac-commercial
  yujin.forge.json          # project-level Forge config + license ref
  src/
    nac/
      manifest.ts            # registered on boot
      verbs.ts               # canonical verb catalogue
    components/
      *.tsx                  # NAC-3 conformant by construction
    pages/
      *.tsx
    mocks/                   # AUTO-GENERATED, do not edit
      handlers.ts
      fixtures/
  tests/
    unit/                    # AUTO-GENERATED + hand-extensible
    e2e/                     # Playwright, AUTO-GENERATED
  .yujin-forge/
    cache/                   # license cache, AST cache, mock build cache
```

### 4.4 Test generation contract

For each component decorated with `data-nac-id` + `data-nac-role`:

| Role | Tests generated |
|------|-----------------|
| `action` | Playwright: assert NAC.click resolves + ack within 5s |
| `field` | Playwright: assert NAC.fill changes value + nac:field:changed fires |
| `tab` | Playwright: assert NAC.tab activates + panel becomes visible |
| `data-table` | Vitest: dt_add_row / remove / edit semantics + commit/discard |
| `confirm-dialog` | Playwright: confirm/cancel flow |
| `region` | Vitest: rendered in tree + presence in NAC.describe() |

Plus mocks for every external call (`fetch`, `axios`, `WebSocket`)
inferred by AST walk. The mock layer ships with sane defaults
the user overrides per-test.

## 5. Voice + chat panel

Embedded `nac-chat-client.js` (the v2.3 runtime). Renders inside
the `yf dev` server's UI (a small floating panel). Behaviour:

- Push-to-talk + hands-free.
- 10-locale support out of the box (NAC i18n contract).
- All chat-driven actions go through NAC.click_by_verb /
  NAC.fill / NAC.edit_field -- the SAME contract the agent uses.
- Chat transcripts logged to `.yujin-forge/cache/chat/` for
  audit.

## 6. Migration tool

`yf migrate <repo>` walks the React project's AST:

1. **Identify candidates.** Every JSX element with an `onClick`
   becomes a candidate `action`. Every `<input>` / `<select>` /
   `<textarea>` becomes a candidate `field`.
2. **Propose ids.** Names derived from component path + element
   semantic role: `pages.invoice.save_button`.
3. **Generate manifest.** Static analysis produces a
   `manifest.ts` skeleton with `label_i18n` placeholders. Forge
   then asks Claude to fill in the 10 locales.
4. **Show diff.** User reviews per-file in the chat UI.
5. **Apply.** Atomic: per-file commit, run tests after each.
   Rollback if any test breaks.

End-state: the project passes `NAC.validate_global({probe: true})`
clean + `npx @yujin/nac validate ./src` reports zero errors.

## 7. Telemetry + privacy

Forge reports to the parent:
- License key + machine fingerprint hash.
- Aggregate counts per project (LoC migrated, tests generated,
  mocks built).
- Anonymised error fingerprints for the autodeveloper loop.

Forge does NOT report:
- Source code.
- Component names or business-domain strings.
- User chat content.
- Generated test fixtures.

Configurable in `yujin.forge.json` -> `telemetry.opt_out: true`
for enterprise teams that need air-gapped operation.

## 8. Roadmap to v1.0

| Milestone | Target | Status |
|-----------|--------|--------|
| Repo created | 2026-05-10 | DONE |
| SPEC doc | 2026-05-11 | DONE (this file) |
| CLI skeleton | 2026-06 | not started |
| License client | 2026-06 | not started |
| Template scaffold | 2026-07 | not started |
| Test corpus gen | 2026-08 | not started |
| Mock gen | 2026-08 | not started |
| Voice + chat panel | 2026-09 | not started |
| Migration tool | 2026-10 | not started |
| `yf ship` gate | 2026-11 | not started |
| v1.0 GA | 2026-Q4 | not started |

Implementation begins **after** NAC v2.3 GA so Forge ships
against a stable spec.

## 9. Open questions

- **Pricing.** Per-seat / per-project / per-org? Forge depends on
  Claude API tokens via the seat license, so pricing has to
  cover that variable cost. Tentative: $89/seat/mo with 1M
  tokens/mo included, $0.05/1k tokens after that.
- **Self-hosting story.** Some enterprise teams will want
  air-gapped Forge with their own LLM endpoint. Plan: ship
  `forge.json` configurable endpoint; ship a docker compose that
  bundles MSW + Playwright + the CLI.
- **Multi-framework.** v1 is React-only. v2 candidates: Vue,
  Angular (already have NAC adoption guides for both), Svelte,
  vanilla. Each requires its own scaffolder + AST walker.
- **VS Code extension.** Should the chat panel be a VS Code
  extension OR a separate webview? Probably both: the CLI ships
  the standalone, the VS Code extension wraps the CLI with
  editor-native integration.

## 10. Naming + brand

- **Yujin Forge** -- product name.
- Tagline: *Build NAC-3 React apps the way Yujin builds Yujin.*
- Logo: TBD. The sumi-e brand language of the Yujin parent
  applies (warm ink, gold accent, kanji watermark).

---

*This document is the day-0 spec for Yujin Forge. Edits to this
file constitute product changes and require an RFC. The
canonical issue tracker is the repository's GitHub Issues.*
