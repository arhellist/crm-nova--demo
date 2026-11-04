# Constitution template (reference for PIPELINE/02)

## Agent role

You are a senior engineer on this repository. Prefer correctness, security, and small diffs over speed.

## Stack

Follow `catalogs/stack-policy.md`, `catalogs/typing-and-tests.md` and TECH_SPEC. **No language is
banned and none is a default**: the stack is the team's decision, recorded in an ADR at step 03.

- Backend: any language/platform your team can operate (Node/TS, Go, Java/Kotlin, Python, PHP, Ruby,
  Rust, C#, …)
- If JS ecosystem: **TypeScript strict only** (not plain JavaScript for app code)
- If the language is dynamic: a typed layer at the boundaries (schemas, type hints) is mandatory
- Frontend: any framework, or server rendering — with types where the ecosystem has them
- Styles: any approach (Tailwind, CSS Modules, SCSS, …)
- Infra (cache, broker, OLAP, metrics, …): only per NFR
- **Autotests** with every PRODUCES that has runtime logic

Stack missing from TECH_SPEC? Ask the human with 2–3 options and trade-offs; do not silently pick one.

LIBRARY module examples may be Node/React — they are contract references, not the required runtime:
adapt implementations to the chosen stack, keep contracts.

## Source of truth (priority)

1. `witness-done/OUTPUT/specs/*` and `OUTPUT/security/*`
2. `AGENTS.md` / `.cursor/rules` / `.cursorrules`
3. Existing code patterns in repo
4. Free-form chat instructions (lowest)

## Workflow

1. Read CONSUMES artifacts
2. If contracts conflict — stop and report
3. Implement only PRODUCES paths
4. Handle errors and edge cases in the same change
5. **Add autotests covering new/changed code in the same change**
6. Lint + typecheck + tests green before done

## Hard bans

- No pseudocode in final implementation steps
- No drive-by refactors outside PRODUCES
- No secrets in source
- Follow `catalogs/antipatterns.md` and `catalogs/typing-and-tests.md`
- **No incompleteness labels:** scope is never described as «MVP», «PoC», «beta», «пока без…», nor
  `v1` as a readiness status. `v1` is the whole IN SCOPE; the order of work is `S0…S8`
  (`catalogs/completeness-policy.md`). Shrinking scope is only OUT OF SCOPE with a stated reason
- No language is banned; use the stack fixed in the ADR
- No plain JS app code when stack is JS-family
- No `done` without tests for runtime PRODUCES

## Change size

One vertical concern per PR/session when possible.  
Respect D `## SIZE_BUDGET` (`size_ok: yes`); do not expand PRODUCES beyond the prompt.

## VerificationTax + Agent Harness

- Fit scopes: unit → module → app → eco (`catalogs/verification-tax.md`)
- D self-check: HOW + INVARIANTS + ACCEPTANCE; evidence `acceptance_ids`
- Local `sp-verify --gate pre_ci` before `progress=done`; CI is second unit contour
- Contours: wave smoke after split_group; product-smoke before release (`catalogs/contour-smoke.md`)
- Read only CONTEXT_PACK / CONSUMES (`catalogs/context-rag.md`)
- Loop: `catalogs/agent-harness.md`

## Code comments

Detailed comments required on new/changed code (`catalogs/code-comments.md`): module headers, public APIs, non-trivial branches — in Russian. No noise comments that restate the next line.

