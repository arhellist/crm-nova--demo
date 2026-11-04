#!/usr/bin/env bash
# Проверка целостности Witness Done (не запускает ИИ).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
ERR=0

ok() { echo "  OK  $*"; }
fail() { echo "  FAIL $*"; ERR=1; }

echo "=== validate witness-done ==="
echo "Root: $ROOT"

# VERSION
if [[ -f "$ROOT/VERSION" ]]; then
  VER=$(tr -d '[:space:]' < "$ROOT/VERSION")
  [[ -n "$VER" ]] && ok "VERSION=$VER" || fail "VERSION empty"
else
  fail "VERSION missing"
fi

# Required top-level files
for f in README.md ORCHESTRATOR.md PROFILES.md run.sh; do
  [[ -f "$ROOT/$f" ]] && ok "$f" || fail "missing $f"
done

# Pipeline 00-10
for i in 00 01 02 03 04 05 06 07 08 09 10; do
  matches=("$ROOT"/PIPELINE/${i}_*.md)
  if [[ -f "${matches[0]}" ]]; then
    ok "PIPELINE/${i}_*"
  else
    fail "PIPELINE/${i}_*.md missing"
  fi
done

# Orchestrator references expected step files
ORCH="$ROOT/ORCHESTRATOR.md"
for name in 00_bootstrap 01_analyze_spec 02_constitution 03_architecture \
  04_data_and_api 05_security 06_nfr_scalability 07_component_library \
  08_tooling_lint_cicd 09_roadmap_and_dev_prompts 10_assembly; do
  if grep -q "$name" "$ORCH"; then
    ok "ORCHESTRATOR → $name"
  else
    fail "ORCHESTRATOR missing ref $name"
  fi
done

# Order constraint: library before roadmap in ORCHESTRATOR table sense
if grep -q "07_component_library" "$ORCH" && grep -q "09_roadmap_and_dev_prompts" "$ORCH"; then
  ok "order: library(07) before roadmap(09)"
else
  fail "expected 07 library and 09 roadmap"
fi

# LIBRARY SPEC + CONFLICTS
shopt -s nullglob
specs=("$ROOT"/LIBRARY/*/SPEC.md)
[[ ${#specs[@]} -ge 10 ]] && ok "LIBRARY SPECs: ${#specs[@]}" || fail "too few LIBRARY SPECs (${#specs[@]})"
for s in "${specs[@]}"; do
  id=$(basename "$(dirname "$s")")
  if grep -q "## CONFLICTS with other modules" "$s"; then
    ok "CONFLICTS: $id"
  else
    fail "no CONFLICTS: $id"
  fi
done

# ZionVox / old project noise must not live in SEED templates
NOISE='ZionVox|zionvox|peerAddress|Kademlia|ImplementationPlan|stealth-bridge'
if grep -REin "$NOISE" "$ROOT/SEED" "$ROOT/LIBRARY" "$ROOT/PIPELINE" "$ROOT/ORCHESTRATOR.md" "$ROOT/TEMPLATES" 2>/dev/null | grep -v 'не тащи\|Запрещено\|stealth-bridge.*нет в ТЗ'; then
  fail "legacy project noise found (see above)"
else
  ok "no legacy ZionVox noise in factory core"
fi

# SEED essentials
for f in cursorrules.template.md cursorrules.baseline.md eslintrc.baseline.js \
  eslint-plugin-local-rules/index.js ci.yml.example; do
  [[ -e "$ROOT/SEED/$f" ]] && ok "SEED/$f" || fail "SEED/$f missing"
done

[[ -f "$ROOT/catalogs/stack-policy.md" ]] && ok "catalogs/stack-policy.md" || fail "stack-policy.md missing"
[[ -f "$ROOT/catalogs/language-policy.md" ]] && ok "catalogs/language-policy.md" || fail "language-policy.md missing"
[[ -f "$ROOT/catalogs/completeness-policy.md" ]] && ok "catalogs/completeness-policy.md" || fail "completeness-policy missing"
[[ -f "$ROOT/catalogs/business-goals.md" ]] && ok "catalogs/business-goals.md" || fail "business-goals missing"
[[ -f "$ROOT/catalogs/cicd-environments.md" ]] && ok "catalogs/cicd-environments.md" || fail "cicd-environments missing"
[[ -f "$ROOT/catalogs/design-input.md" ]] && ok "catalogs/design-input.md" || fail "design-input missing"
[[ -f "$ROOT/catalogs/typing-and-tests.md" ]] && ok "catalogs/typing-and-tests.md" || fail "typing-and-tests missing"
[[ -f "$ROOT/catalogs/verification-tax.md" ]] && ok "catalogs/verification-tax.md" || fail "verification-tax missing"
[[ -f "$ROOT/catalogs/contour-smoke.md" ]] && ok "catalogs/contour-smoke.md" || fail "contour-smoke missing"
[[ -f "$ROOT/catalogs/agent-harness.md" ]] && ok "catalogs/agent-harness.md" || fail "agent-harness missing"
[[ -f "$ROOT/catalogs/context-rag.md" ]] && ok "catalogs/context-rag.md" || fail "context-rag missing"
[[ -f "$ROOT/catalogs/code-comments.md" ]] && ok "catalogs/code-comments.md" || fail "code-comments missing"
if grep -q 'подробн' "$ROOT/catalogs/code-comments.md"; then
  ok "code-comments requires detailed comments"
else
  fail "code-comments incomplete"
fi
if grep -q 'code-comments' "$ROOT/SEED/cursorrules.template.md" && grep -q 'подробн' "$ROOT/SEED/cursorrules.template.md"; then
  ok "cursorrules.template requires detailed comments"
else
  fail "cursorrules.template missing detailed comments"
fi
if grep -q 'code-comments' "$ROOT/TEMPLATES/dev-prompt.md"; then
  ok "dev-prompt references code-comments"
else
  fail "dev-prompt missing code-comments"
fi
[[ -f "$ROOT/TEMPLATES/context-pack.md" ]] && ok "TEMPLATES/context-pack.md" || fail "context-pack template missing"
[[ -f "$ROOT/TEMPLATES/context-index.md" ]] && ok "TEMPLATES/context-index.md" || fail "context-index template missing"
[[ -f "$ROOT/TEMPLATES/evidence.md" ]] && ok "TEMPLATES/evidence.md" || fail "evidence template missing"
[[ -f "$ROOT/SEED/sp-tools/sp-retrieve.mjs" ]] && ok "SEED/sp-tools/sp-retrieve.mjs" || fail "sp-retrieve missing"
[[ -f "$ROOT/SEED/sp-tools/sp-verify.mjs" ]] && ok "SEED/sp-tools/sp-verify.mjs" || fail "sp-verify missing"
if grep -q 'FIT_CHECKS' "$ROOT/TEMPLATES/dev-prompt.md" && grep -q 'VERIFICATION_TAX' "$ROOT/TEMPLATES/dev-prompt.md"; then
  ok "dev-prompt has FIT_CHECKS + VERIFICATION_TAX"
else
  fail "dev-prompt missing FIT_CHECKS/VERIFICATION_TAX"
fi
if grep -q '## HOW' "$ROOT/TEMPLATES/dev-prompt.md" \
  && grep -q '## INVARIANTS' "$ROOT/TEMPLATES/dev-prompt.md" \
  && grep -q '## ACCEPTANCE' "$ROOT/TEMPLATES/dev-prompt.md"; then
  ok "dev-prompt has HOW + INVARIANTS + ACCEPTANCE"
else
  fail "dev-prompt missing HOW/INVARIANTS/ACCEPTANCE"
fi
if grep -q 'acceptance_ids' "$ROOT/TEMPLATES/evidence.md"; then
  ok "evidence template has acceptance_ids"
else
  fail "evidence template missing acceptance_ids"
fi
if grep -q 'Contours' "$ROOT/catalogs/verification-tax.md" \
  && grep -q 'Acceptance contract' "$ROOT/catalogs/verification-tax.md"; then
  ok "verification-tax has Contours + Acceptance contract"
else
  fail "verification-tax missing Contours/Acceptance"
fi
if grep -q 'acceptance_ids\|parseAcceptanceIds\|ACCEPTANCE' "$ROOT/SEED/sp-tools/sp-verify.mjs"; then
  ok "sp-verify handles ACCEPTANCE / acceptance_ids"
else
  fail "sp-verify missing acceptance contract"
fi
[[ -f "$ROOT/SEED/smoke/product-smoke.md.example" ]] && ok "SEED/smoke/product-smoke.md.example" || fail "product-smoke example missing"
[[ -f "$ROOT/SEED/smoke/wave-api-smoke.sh.example" ]] && ok "SEED/smoke/wave-api-smoke.sh.example" || fail "wave-api-smoke example missing"
if grep -q 'contour-smoke' "$ROOT/PIPELINE/08_tooling_lint_cicd.md" \
  && grep -q 'product-smoke\|wave-api-smoke\|SEED/smoke' "$ROOT/PIPELINE/08_tooling_lint_cicd.md"; then
  ok "PIPELINE/08 requires smoke from SEED"
else
  fail "PIPELINE/08 missing smoke SEED"
fi
if grep -q 'HOW' "$ROOT/PIPELINE/09_roadmap_and_dev_prompts.md" \
  && grep -q 'Decision lock\|decision lock\|Decision lock' "$ROOT/PIPELINE/09_roadmap_and_dev_prompts.md"; then
  ok "PIPELINE/09 requires HOW + decision lock"
else
  fail "PIPELINE/09 missing HOW/decision lock"
fi
if grep -q '## HOW\|ACCEPTANCE' "$ROOT/PIPELINE/10_assembly.md"; then
  ok "PIPELINE/10 audits HOW/ACCEPTANCE"
else
  fail "PIPELINE/10 missing HOW/ACCEPTANCE audit"
fi
if grep -q 'verification-tax' "$ROOT/ORCHESTRATOR.md" && grep -q 'agent-harness' "$ROOT/ORCHESTRATOR.md"; then
  ok "ORCHESTRATOR references tax/harness"
else
  fail "ORCHESTRATOR missing tax/harness refs"
fi
if grep -q 'contour-smoke' "$ROOT/ORCHESTRATOR.md"; then
  ok "ORCHESTRATOR references contour-smoke"
else
  fail "ORCHESTRATOR missing contour-smoke"
fi
if grep -q 'CONTEXT_PACK' "$ROOT/PIPELINE/09_roadmap_and_dev_prompts.md"; then
  ok "PIPELINE/09 requires CONTEXT_PACK"
else
  fail "PIPELINE/09 missing CONTEXT_PACK"
fi
if grep -q 'FIT_CHECKS\|VERIFICATION_TAX\|context-rag' "$ROOT/PIPELINE/10_assembly.md"; then
  ok "PIPELINE/10 audits tax/context"
else
  fail "PIPELINE/10 missing tax/context audit"
fi
if grep -q 'harness.md' "$ROOT/PIPELINE/08_tooling_lint_cicd.md"; then
  ok "PIPELINE/08 documents harness"
else
  fail "PIPELINE/08 missing harness"
fi
if grep -q 'pre_ci' "$ROOT/SEED/cursorrules.template.md"; then
  ok "cursorrules.template has pre_ci"
else
  fail "cursorrules.template missing pre_ci"
fi
if grep -q 'TypeScript' "$ROOT/catalogs/typing-and-tests.md" && grep -qi 'автотест' "$ROOT/catalogs/typing-and-tests.md"; then
  ok "typing-and-tests has TS + tests rules"
else
  fail "typing-and-tests incomplete"
fi
[[ -f "$ROOT/TEMPLATES/coverage-matrix.md" ]] && ok "TEMPLATES/coverage-matrix.md" || fail "coverage-matrix template missing"
[[ -f "$ROOT/TEMPLATES/cicd-and-environments.md" ]] && ok "TEMPLATES/cicd-and-environments.md" || fail "cicd template missing"
[[ -f "$ROOT/TEMPLATES/design-notes.md" ]] && ok "TEMPLATES/design-notes.md" || fail "design-notes template missing"
[[ -f "$ROOT/TEMPLATES/feedback.md" ]] && ok "TEMPLATES/feedback.md" || fail "feedback template missing"
if grep -q 'feedback.md' "$ROOT/PIPELINE/10_assembly.md"; then
  ok "PIPELINE/10 requires feedback.md"
else
  fail "PIPELINE/10 missing feedback.md"
fi
[[ -f "$ROOT/TEMPLATES/examples/DESIGN.example.html" ]] && ok "TEMPLATES/examples/DESIGN.example.html" || fail "DESIGN example missing"
if grep -q 'completeness-policy' "$ROOT/PIPELINE/09_roadmap_and_dev_prompts.md"; then
  ok "PIPELINE/09 references completeness"
else
  fail "PIPELINE/09 missing completeness"
fi
if grep -q 'SIZE_BUDGET' "$ROOT/TEMPLATES/dev-prompt.md"; then
  ok "TEMPLATES/dev-prompt has SIZE_BUDGET"
else
  fail "dev-prompt missing SIZE_BUDGET"
fi
if grep -q 'SIZE_BUDGET' "$ROOT/catalogs/completeness-policy.md"; then
  ok "completeness-policy has SIZE_BUDGET"
else
  fail "completeness-policy missing SIZE_BUDGET"
fi
# Запрет ярлыков неполноты — правило канона, а не принцип README (DEC-026).
if grep -q 'Запрет ярлыков неполноты' "$ROOT/catalogs/completeness-policy.md" \
  && grep -q 'MVP' "$ROOT/catalogs/completeness-policy.md" \
  && grep -q 'порядок работ' "$ROOT/catalogs/completeness-policy.md"; then
  ok "completeness-policy запрещает ярлыки неполноты (MVP/PoC/v1-как-статус)"
else
  fail "completeness-policy не содержит запрета ярлыков неполноты"
fi
if grep -qi 'ярлык неполноты' "$ROOT/catalogs/antipatterns.md"; then
  ok "antipatterns: ярлык неполноты"
else
  fail "antipatterns missing ярлык неполноты"
fi
if grep -q 'ярлыков неполноты' "$ROOT/PIPELINE/02_constitution.md" \
  && grep -q 'ярлыки неполноты' "$ROOT/SEED/cursorrules.template.md" \
  && grep -q 'No incompleteness labels' "$ROOT/TEMPLATES/constitution.md"; then
  ok "запрет ярлыков неполноты доходит до конституции проекта (02 + SEED + TEMPLATES)"
else
  fail "запрет ярлыков неполноты не доходит до конституции проекта"
fi
if grep -q 'ярлык неполноты' "$ROOT/SEED/sp-tools/sp-verify.mjs" \
  && grep -q 'findIncompletenessLabels' "$ROOT/SEED/sp-tools/evidence-lib.mjs"; then
  ok "d-prompt-quality валит ярлыки неполноты"
else
  fail "нет гейта на ярлыки неполноты в d-prompt-quality"
fi
if grep -q 'd-cut-list' "$ROOT/PIPELINE/09_roadmap_and_dev_prompts.md"; then
  ok "PIPELINE/09 requires d-cut-list"
else
  fail "PIPELINE/09 missing d-cut-list"
fi
if grep -q 'C1' "$ROOT/ORCHESTRATOR.md" && grep -q 'C2' "$ROOT/ORCHESTRATOR.md"; then
  ok "ORCHESTRATOR has C1/C2 subwaves"
else
  fail "ORCHESTRATOR missing C subwaves"
fi
if grep -q 'SIZE_BUDGET' "$ROOT/PIPELINE/10_assembly.md"; then
  ok "PIPELINE/10 audits SIZE_BUDGET"
else
  fail "PIPELINE/10 missing SIZE_BUDGET audit"
fi
if grep -q 'черновые срезы' "$ROOT/PIPELINE/01_analyze_spec.md"; then
  ok "PIPELINE/01 drafts coverage slices"
else
  fail "PIPELINE/01 missing draft slices"
fi
if grep -q 'business-goals\|Бизнес-цели' "$ROOT/PIPELINE/01_analyze_spec.md" \
  && grep -q 'Business' "$ROOT/INPUT/ANSWERS.md" \
  && grep -q 'Бизнес-цели' "$ROOT/INPUT/TECH_SPEC.template.md"; then
  ok "business-goals wired in 01 / ANSWERS / TECH_SPEC"
else
  fail "business-goals not wired"
fi
if grep -q 'business-goals' "$ROOT/ORCHESTRATOR.md"; then
  ok "ORCHESTRATOR references business-goals"
else
  fail "ORCHESTRATOR missing business-goals"
fi
if grep -q 'cicd-and-environments' "$ROOT/PIPELINE/08_tooling_lint_cicd.md"; then
  ok "PIPELINE/08 references cicd"
else
  fail "PIPELINE/08 missing cicd"
fi
if grep -q 'Стек не фиксирован каноном' "$ROOT/catalogs/stack-policy.md" \
  && grep -q 'нет запрещённых языков' "$ROOT/catalogs/stack-policy.md"; then
  ok "stack-policy: стек выбирает команда, запретов языка нет"
else
  fail "stack-policy фиксирует стек за команду"
fi
# Регресс: канон не должен снова начать назначать или запрещать язык.
STACK_BAN="$(grep -rniE 'не PHP|PHP и Python.*запрещ|PHP/Python|запрещено как основной backend|never PHP' \
  "$ROOT/catalogs" "$ROOT/PIPELINE" "$ROOT/TEMPLATES" "$ROOT/INPUT" "$ROOT/SEED" \
  "$ROOT/README.md" "$ROOT/PROFILES.md" --include='*.md' --include='*.template*' 2>/dev/null || true)"
if [[ -z "$STACK_BAN" ]]; then
  ok "канон не запрещает и не назначает язык по умолчанию"
else
  fail "в каноне остался запрет языка: $STACK_BAN"
fi
if grep -q 'Основной язык — русский' "$ROOT/catalogs/language-policy.md"; then
  ok "language-policy Russian-first"
else
  fail "language-policy incomplete"
fi

# Brownfield mode validation (R00-R05, spec-state, templates)
for step in R00_reverse_engineer R01_baseline_specs R02_propose_change R03_apply_change R04_verify_change R05_archive_change; do
  if [[ -f "$ROOT/PIPELINE/${step}.md" ]]; then
    ok "PIPELINE/${step}"
  else
    fail "PIPELINE/${step}.md missing"
  fi
  if grep -q "$step" "$ORCH"; then
    ok "ORCHESTRATOR → $step"
  else
    fail "ORCHESTRATOR missing ref $step"
  fi
done

if grep -q 'spec-state' "$ORCH"; then
  ok "ORCHESTRATOR references spec-state"
else
  fail "ORCHESTRATOR missing spec-state"
fi

for f in spec-state-config.yaml change-proposal.md change-delta-spec.md change-design.md change-tasks.md; do
  [[ -f "$ROOT/TEMPLATES/$f" ]] && ok "TEMPLATES/$f" || fail "TEMPLATES/$f missing"
done

DELTA_TPL="$ROOT/TEMPLATES/change-delta-spec.md"
if grep -q '## ADDED Requirements' "$DELTA_TPL" \
  && grep -q '## MODIFIED Requirements' "$DELTA_TPL" \
  && grep -q '## REMOVED Requirements' "$DELTA_TPL"; then
  ok "change-delta-spec has ADDED/MODIFIED/REMOVED"
else
  fail "change-delta-spec missing delta sections"
fi

if grep -q -- '--change' "$ROOT/SEED/sp-tools/sp-verify.mjs" \
  && grep -q "gate === 'change'" "$ROOT/SEED/sp-tools/sp-verify.mjs"; then
  ok "sp-verify supports --change and --gate change"
else
  fail "sp-verify missing change gate support"
fi

# Self-audit (10b) + exit criteria
[[ -f "$ROOT/PIPELINE/10b_self_audit.md" ]] && ok "PIPELINE/10b_self_audit.md" || fail "PIPELINE/10b_self_audit.md missing"
if grep -q '10b_self_audit' "$ORCH"; then
  ok "ORCHESTRATOR → 10b_self_audit"
else
  fail "ORCHESTRATOR missing ref 10b_self_audit"
fi
if grep -q 'C4' "$ORCH" && grep -q 'self-audit' "$ORCH"; then
  ok "ORCHESTRATOR has C4 self-audit wave"
else
  fail "ORCHESTRATOR missing C4 self-audit"
fi
if grep -q '10b' "$ROOT/TEMPLATES/manifest.md"; then
  ok "MANIFEST tracks 10b"
else
  fail "MANIFEST missing 10b"
fi
[[ -f "$ROOT/TEMPLATES/exit-criteria.md" ]] && ok "TEMPLATES/exit-criteria.md" || fail "exit-criteria template missing"
for t in review project-invariants spec-packet feedback-lite runtime-trace progress.d-fragment; do
  [[ -f "$ROOT/TEMPLATES/$t.md" ]] && ok "TEMPLATES/$t.md" || fail "TEMPLATES/$t.md missing"
done
[[ -f "$ROOT/catalogs/invariants.md" ]] && ok "catalogs/invariants.md" || fail "catalogs/invariants.md missing"
if grep -q 'exit-criteria' "$ROOT/PIPELINE/10_assembly.md" \
  && grep -q 'exit-criteria' "$ROOT/PIPELINE/10b_self_audit.md"; then
  ok "exit-criteria wired in 10 / 10b"
else
  fail "exit-criteria not wired in 10 / 10b"
fi
for gate in d-prompt-quality self-audit product-smoke baseline; do
  if grep -q "gate === '$gate'" "$ROOT/SEED/sp-tools/sp-verify.mjs"; then
    ok "sp-verify gate: $gate"
  else
    fail "sp-verify missing gate: $gate"
  fi
done
if grep -q -- '--batch' "$ROOT/SEED/sp-tools/sp-verify.mjs" \
  && grep -q 'BATCH = 5' "$ROOT/SEED/sp-tools/sp-verify.mjs"; then
  ok "sp-verify d-prompt-quality batches ≤5"
else
  fail "sp-verify missing batch ≤5"
fi
# Гейты не должны быть декларацией: каждая заявленная проверка ищется в коде
for pair in \
  'sp-verify.mjs:acceptanceThreshold:порог ACCEPTANCE в pre_ci' \
  'sp-verify.mjs:conflictBlockers:blocker из 07_conflicts.md' \
  'sp-verify.mjs:diffAgainstProduces:out_of_produces из git' \
  'sp-verify.mjs:acceptanceMatchesPrompt:сверка акта с промптом' \
  'sp-retrieve.mjs:CANON_MAX_CHUNKS:жёсткий лимит чанков' \
  'evidence-lib.mjs:produces_digest:code_hash с отпечатком PRODUCES' \
  'evidence-lib.mjs:evidence_hash:печать акта evidence_hash' \
  'evidence-lib.mjs:reviewCheck:review-артефакт проверяется против акта' \
  'invariants-lib.mjs:waiverState:waiver инварианта с причиной и сроком' \
  'sp-verify.mjs:selectInvariants:инварианты выбираются по module и уровню' \
  'sp-verify.mjs:spec-packet:гейт spec-packet' \
  'sp-verify.mjs:runMode:lite-режим в гейтах' \
  'sp-verify.mjs:planToProof:симметричная сверка PRODUCES с diff' \
  'sp-verify.mjs:proof_debt:proof_debt валит tax_pass' \
  'sp-verify.mjs:traceCheck:runtime trace для L3' \
  'evidence-lib.mjs:trace:хеш трейса в цепочке акта' \
  'sp.mjs:mergeProgressRows:конфликт фрагментов по updated_at' \
  'sp.mjs:progress --check:сверка progress.md с фрагментами' \
  'sp-verify.mjs:approval:approval для L3-изменения' \
  'evidence-lib.mjs:coverageConfidence:coverage_confidence в RELEASE.json' \
  'evidence-lib.mjs:expandProduces:glob раскрывается в файлы для хеша и diff' \
  'evidence-lib.mjs:gitFileState:печать акта подтверждается чистотой в git' \
  'sp.mjs:строки без фрагмента:progress --check валит строку без фрагмента' \
  'sp.mjs:--team:командный режим doctor' \
  'sp.mjs:не найден в journal/intake:Intake в proposal.md существует'; do
  IFS=':' read -r file marker label <<< "$pair"
  if grep -q -- "$marker" "$ROOT/SEED/sp-tools/$file"; then
    ok "реализовано: $label"
  else
    fail "нет реализации: $label ($file)"
  fi
done

if grep -q 'missing PRODUCES' "$ROOT/SEED/sp-tools/sp-verify.mjs" \
  && grep -q 'module "\${mod}" not found' "$ROOT/SEED/sp-tools/sp-verify.mjs"; then
  ok "sp-verify strict produces + module"
else
  fail "sp-verify produces/module not strict"
fi
if grep -q 'Backwards Compatibility' "$ROOT/SEED/sp-tools/sp-verify.mjs" \
  && grep -q 'schema_version: 1' "$ROOT/SEED/sp-tools/sp-verify.mjs"; then
  ok "change gate checks compatibility + schema_version"
else
  fail "change gate missing compatibility/schema_version"
fi
if grep -q 'Bootstrapped pack' "$ROOT/SEED/sp-tools/sp-retrieve.mjs"; then
  fail "sp-retrieve still auto-creates packs during validate"
else
  ok "sp-retrieve does not auto-create packs"
fi
if grep -q 'Context pack not found' "$ROOT/SEED/sp-tools/sp-retrieve.mjs" \
  && grep -q 'must_hit_paths' "$ROOT/SEED/sp-tools/sp-retrieve.mjs"; then
  ok "sp-retrieve hard-fails missing pack + must_hit"
else
  fail "sp-retrieve missing pack/must_hit enforcement"
fi
if grep -q 'negative / boundary' "$ROOT/PIPELINE/R01_baseline_specs.md" \
  && grep -q -- '--gate baseline' "$ROOT/PIPELINE/R01_baseline_specs.md"; then
  ok "R01 requires 2 scenarios + baseline gate"
else
  fail "R01 missing 2-scenario/baseline gate"
fi

if grep -q -- '--gate d-prompt-quality' "$ROOT/PIPELINE/09_roadmap_and_dev_prompts.md"; then
  ok "PIPELINE/09 requires batch d-prompt-quality gate"
else
  fail "PIPELINE/09 missing batch d-prompt-quality gate"
fi
if grep -q 'd-prompt-quality' "$ROOT/ORCHESTRATOR.md"; then
  ok "ORCHESTRATOR references d-prompt-quality"
else
  fail "ORCHESTRATOR missing d-prompt-quality"
fi

# P1: паспорт прогона, профили, единый README (философия + границы), brownfield-документы, NFR, гигиена OUTPUT
if grep -q '| MODE |' "$ROOT/TEMPLATES/manifest.md" \
  && grep -q '| Профиль |' "$ROOT/TEMPLATES/manifest.md" \
  && grep -q 'FACTORY_PATH' "$ROOT/TEMPLATES/manifest.md" \
  && grep -q 'design_input' "$ROOT/TEMPLATES/manifest.md" \
  && grep -q 'coverage_matrix' "$ROOT/TEMPLATES/manifest.md"; then
  ok "MANIFEST has MODE/profile/design_input/coverage_matrix"
else
  fail "MANIFEST missing passport fields"
fi
for step in R00 R01 R02 R03 R04 R05; do
  if grep -q "^| $step |" "$ROOT/TEMPLATES/manifest.md"; then
    ok "MANIFEST tracks $step"
  else
    fail "MANIFEST missing $step row"
  fi
done
if grep -q 'agent-harness' "$ROOT/PROFILES.md" \
  && grep -q 'data-platform' "$ROOT/PROFILES.md" \
  && grep -q 'Отклонения от профиля' "$ROOT/PROFILES.md"; then
  ok "PROFILES has agent-harness/data-platform + deviations"
else
  fail "PROFILES incomplete"
fi
if grep -q 'Профиль' "$ROOT/PIPELINE/00_bootstrap.md" \
  && grep -q 'FACTORY_PATH' "$ROOT/PIPELINE/00_bootstrap.md"; then
  ok "PIPELINE/00 records profile + FACTORY_PATH"
else
  fail "PIPELINE/00 missing profile/FACTORY_PATH"
fi
if grep -q 'Что фабрика \*\*не\*\* делает' "$ROOT/README.md" \
  && grep -q 'Не пишет код продукта' "$ROOT/README.md"; then
  ok "README has philosophy + boundaries (single project doc)"
else
  fail "README missing philosophy/boundaries"
fi
[[ -e "$ROOT/ABOUT.md" ]] && fail "ABOUT.md must be merged into README" || ok "no separate ABOUT.md"
for section in 'Зачем существует Witness Done' 'Ключевые понятия' 'Структура фабрики' \
  'Greenfield: что происходит на каждом шаге' 'Задание на разработку' \
  'Как доказывается готовность' 'Brownfield: эволюция спецификаций' 'Полный перечень команд'; do
  if grep -q "$section" "$ROOT/README.md"; then
    ok "README section: $section"
  else
    fail "README missing section: $section"
  fi
done
for topic in 'sp-verify' 'spec-state' 'MANIFEST' 'SIZE_BUDGET' 'coverage-matrix' 'exit-criteria'; do
  if grep -q "$topic" "$ROOT/README.md"; then
    ok "README covers $topic"
  else
    fail "README does not cover $topic"
  fi
done
if grep -q 'Что не делаем' "$ROOT/TEMPLATES/change-proposal.md" \
  && grep -q 'Backwards Compatibility' "$ROOT/TEMPLATES/change-proposal.md" \
  && grep -q 'Трассировка' "$ROOT/TEMPLATES/change-proposal.md"; then
  ok "proposal template has non-goals + compat + trace"
else
  fail "proposal template incomplete"
fi
if grep -q 'Axx' "$ROOT/TEMPLATES/change-tasks.md" \
  && grep -q 'Rxx' "$ROOT/TEMPLATES/change-tasks.md"; then
  ok "tasks template binds Axx/Rxx"
else
  fail "tasks template without Axx/Rxx binding"
fi
if grep -q 'Что не делаем' "$ROOT/PIPELINE/R02_propose_change.md" \
  && grep -q 'Axx.k' "$ROOT/PIPELINE/R02_propose_change.md"; then
  ok "R02 requires non-goals + Axx binding"
else
  fail "R02 missing non-goals/Axx binding"
fi
if grep -q 'progress.md' "$ROOT/PIPELINE/R05_archive_change.md" \
  && grep -q -- '--gate baseline' "$ROOT/PIPELINE/R05_archive_change.md"; then
  ok "R05 updates progress + baseline gate"
else
  fail "R05 missing progress/baseline gate"
fi
if grep -q 'Способ проверки' "$ROOT/PIPELINE/06_nfr_scalability.md"; then
  ok "PIPELINE/06 requires NFR verification method"
else
  fail "PIPELINE/06 NFR not verifiable"
fi
if grep -q 'NFR без числа' "$ROOT/PIPELINE/10_assembly.md"; then
  ok "PIPELINE/10 audits NFR verifiability"
else
  fail "PIPELINE/10 missing NFR audit"
fi
if grep -q 'L0…L3' "$ROOT/catalogs/verification-tax.md" \
  && grep -q 'Контур 1/2/3' "$ROOT/catalogs/verification-tax.md"; then
  ok "verification-tax has level/contour/gate glossary"
else
  fail "verification-tax missing glossary"
fi

# Version markers: только VERSION — источник, README показывает ту же версию в заголовке
VER=$(tr -d '[:space:]' < "$ROOT/VERSION")
TITLE_VER=$(sed -n '1s/^# Witness Done (v\([0-9][0-9.]*\)).*/\1/p' "$ROOT/README.md")
if [[ "$TITLE_VER" == "$VER" ]]; then
  ok "README title version $TITLE_VER == VERSION"
else
  fail "README title v${TITLE_VER:-?} != VERSION $VER — заголовок описывает прошлое"
fi
CUR_VER=$(grep -o 'Версия — одна строка в `VERSION` (сейчас `[0-9][0-9.]*`)' "$ROOT/README.md" | grep -o '`[0-9][0-9.]*`' | tr -d '`')
if [[ "$CUR_VER" == "$VER" ]]; then
  ok "README «сейчас $CUR_VER» == VERSION"
else
  fail "README «сейчас ${CUR_VER:-?}» != VERSION $VER"
fi
if grep -rqE 'v1\.[0-9]+\+' "$ROOT/catalogs" "$ROOT/SEED" "$ROOT/PIPELINE" 2>/dev/null; then
  fail "stale 'vX+' version markers remain (use 'правило действует с vX')"
else
  ok "no stale vX+ markers"
fi

# OUTPUT hygiene: канон пуст, каталоги создаёт шаг 00
[[ -d "$ROOT/OUTPUT/library" ]] && fail "OUTPUT/library must not exist" || ok "no OUTPUT/library"
OUTPUT_FILES=$(find "$ROOT/OUTPUT" -type f -not -name '.gitkeep' | wc -l)
if [[ "$OUTPUT_FILES" -eq 0 ]]; then
  ok "OUTPUT clean (only .gitkeep)"
else
  fail "OUTPUT must be empty before step 00 (found $OUTPUT_FILES file(s))"
fi
if grep -q 'Не создавай.*OUTPUT/library' "$ROOT/PIPELINE/00_bootstrap.md"; then
  ok "PIPELINE/00 forbids OUTPUT/library"
else
  fail "PIPELINE/00 missing OUTPUT/library ban"
fi

if grep -q 'delivery_slice' "$ROOT/TEMPLATES/dev-prompt.md" \
  && grep -q 'delivery_slice' "$ROOT/PIPELINE/09_roadmap_and_dev_prompts.md"; then
  ok "delivery_slice in template + step 09"
else
  fail "delivery_slice missing in template/09"
fi
if grep -q 'delivery_slice' "$ROOT/SEED/sp-tools/sp-verify.mjs"; then
  ok "d-prompt-quality checks delivery_slice"
else
  fail "d-prompt-quality missing delivery_slice"
fi

# CLI naming: только sp-*, никаких алиасов и переходных имён
STALE_PF=$(grep -rnE '\bpf-(verify|retrieve|tools)' "$ROOT" \
  --exclude-dir=node_modules --exclude-dir=.git \
  | grep -v 'validate\.sh:' || true)
if [[ -n "$STALE_PF" ]]; then
  fail "stale pf-* CLI names remain (use sp-*)"
  echo "$STALE_PF" | head -10
else
  ok "no stale pf-* CLI names (sp-* only, no aliases)"
fi
if [[ -f "$ROOT/SEED/sp-tools/sp-verify.mjs" ]] && [[ -f "$ROOT/SEED/sp-tools/sp-retrieve.mjs" ]]; then
  ok "SEED/sp-tools/sp-verify.mjs + sp-retrieve.mjs"
else
  fail "SEED/sp-tools binaries missing"
fi
[[ -e "$ROOT/SEED/pf-tools" ]] && fail "SEED/pf-tools must not exist" || ok "no SEED/pf-tools"
if grep -q 'sp-verify.mjs --help' "$ROOT/SEED/sp-tools/USAGE.md" \
  && grep -q 'sp-retrieve.mjs --help' "$ROOT/SEED/sp-tools/USAGE.md"; then
  ok "USAGE.md documents sp-* commands"
else
  fail "USAGE.md not updated for sp-*"
fi
for gate in d-prompt-quality self-audit product-smoke baseline; do
  if grep -q -- "--gate $gate" "$ROOT/SEED/sp-tools/USAGE.md"; then
    ok "USAGE.md documents --gate $gate"
  else
    fail "USAGE.md missing --gate $gate"
  fi
done

# Single README rule (exclude node_modules / vendor)
# SEED/journal/README.md — часть заготовки журнала, а не второй документ о проекте
readme_count=$(find "$ROOT" -name README.md \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path "$ROOT/SEED/journal/*" \
  | wc -l)
[[ "$readme_count" -eq 1 ]] && ok "single README.md" || fail "expected 1 README, found $readme_count"

# --- Журнал: заготовка пустая, журнал проекта коммитится ---
for sub in README.md decisions.md intake decisions; do
  [[ -e "$ROOT/SEED/journal/$sub" ]] && ok "SEED/journal/$sub" || fail "SEED/journal/$sub missing"
done
if [[ -d "$ROOT/SEED/journal/decisions" ]]; then
  SCAFFOLD_REC=$(find "$ROOT/SEED/journal/decisions" -name '*.md' | wc -l)
  [[ "$SCAFFOLD_REC" -eq 0 ]] && ok "SEED/journal/decisions пуст" || fail "SEED/journal/decisions содержит $SCAFFOLD_REC записей — поставка должна быть пустой"
fi
SCAFFOLD_INTAKE=$(find "$ROOT/SEED/journal/intake" -name '*.md' | wc -l)
[[ "$SCAFFOLD_INTAKE" -eq 0 ]] && ok "SEED/journal/intake пуст" || fail "SEED/journal/intake содержит записи — поставка должна быть пустой"
if grep -qE '\bDEC-[0-9]{3,}\b' "$ROOT/SEED/journal/decisions.md" 2>/dev/null; then
  fail "SEED/journal/decisions.md содержит DEC-### — журнал в поставке пустой"
else
  ok "SEED/journal/decisions.md без записей"
fi
if git -C "$ROOT" check-ignore -q journal 2>/dev/null; then
  fail "journal/ в .gitignore — журнал проекта обязан коммититься"
else
  ok "journal/ не игнорируется git"
fi
if grep -q 'journal --init' "$ROOT/PIPELINE/00_bootstrap.md"; then
  ok "step 00 создаёт journal/"
else
  fail "step 00 не создаёт journal/"
fi
if grep -q 'история — в разделе README' "$ROOT/AGENTS.md"; then
  fail "AGENTS.md требует историю версий — история не ведётся"
else
  ok "AGENTS.md не требует истории версий"
fi

# --- 1.14: единый вход, правила агентов, чистая установка ---
[[ -f "$ROOT/SEED/sp-tools/sp.mjs" ]] && ok "SEED/sp-tools/sp.mjs" || fail "sp.mjs missing"
for sub in 'status' 'intake' 'next' 'decide' 'close' 'rules' 'doctor' 'update'; do
  if grep -q "case '\\?$sub'" "$ROOT/SEED/sp-tools/sp.mjs" || grep -q "cmd === '$sub'\|'$sub'," "$ROOT/SEED/sp-tools/sp.mjs"; then
    ok "sp.mjs subcommand: $sub"
  else
    fail "sp.mjs missing subcommand: $sub"
  fi
done
if grep -q 'sp-verify.mjs' "$ROOT/SEED/sp-tools/sp.mjs" && grep -q 'sp-retrieve.mjs' "$ROOT/SEED/sp-tools/sp.mjs"; then
  ok "sp.mjs delegates verify/retrieve"
else
  fail "sp.mjs does not delegate to sp-verify/sp-retrieve"
fi

# --- 1.15: проверка обновлений ---
if [[ -f "$ROOT/SEED/update.json" ]] \
  && grep -q '"repo": "arhellist/WitnessDone"' "$ROOT/SEED/update.json" \
  && grep -q '"branch": "main"' "$ROOT/SEED/update.json"; then
  ok "SEED/update.json → arhellist/WitnessDone@main"
else
  fail "SEED/update.json missing or not pinned to arhellist/WitnessDone@main"
fi
if grep -q 'raw.githubusercontent.com' "$ROOT/SEED/sp-tools/sp.mjs" \
  && grep -q 'ls-remote' "$ROOT/SEED/sp-tools/sp.mjs" \
  && grep -q 'semverCmp' "$ROOT/SEED/sp-tools/sp.mjs"; then
  ok "sp update: git-теги + HTTPS VERSION + semver"
else
  fail "sp update: не найдены источники версий/semver"
fi
if grep -q 'cmdUpdate' "$ROOT/SEED/sp-tools/sp.mjs" \
  && grep -q "'update'" "$ROOT/SEED/sp-tools/sp.mjs" \
  && ! grep -q "sh -c.*git pull" "$ROOT/SEED/sp-tools/sp.mjs"; then
  ok "sp update не применяет обновление сам"
else
  fail "sp update: авто-применение или отсутствие подкоманды"
fi
if grep -q 'updates checks cache' "$ROOT/.gitignore" 2>/dev/null || grep -q '^\.sp-cache/$' "$ROOT/.gitignore"; then
  ok ".sp-cache/ в .gitignore"
else
  fail ".sp-cache/ not ignored"
fi
if grep -q 'Обновление фабрики' "$ROOT/README.md" \
  && grep -q 'sp.mjs update' "$ROOT/SEED/sp-tools/USAGE.md" \
  && grep -q 'sp update' "$ROOT/SEED/sp-tools/USAGE.md"; then
  ok "README/USAGE описывают sp update"
else
  fail "документация sp update отсутствует"
fi

# --- 1.16: канон правится изнутри репозитория ---
for f in .cursorrules .cursor/rules/witness-done.mdc .cursor/commands/sp.md CLAUDE.md GEMINI.md \
         .github/copilot-instructions.md .clinerules/witness-done.md .devin/rules/witness-done.md; do
  [[ -f "$ROOT/$f" ]] && ok "адаптер в поставке: $f" || fail "адаптер отсутствует: $f"
done
if command -v node >/dev/null 2>&1; then
  if node "$ROOT/SEED/sp-tools/sp.mjs" rules --check --root "$ROOT" --factory "$ROOT" >/dev/null 2>&1; then
    ok "адаптеры синхронны с AGENTS.md"
  else
    fail "адаптеры разошлись с AGENTS.md — sp rules --sync"
  fi
  if node "$ROOT/SEED/sp-tools/sp.mjs" doctor --strict --root "$ROOT" --factory "$ROOT" >/dev/null 2>&1; then
    ok "sp doctor --strict в корне канона"
  else
    fail "sp doctor --strict падает в корне канона"
  fi
fi
if grep -q '^#### 10\.2\.[1-9] `' "$ROOT/README.md" \
  && [[ "$(grep -c 'Аргумент | Обязателен | Что значит' "$ROOT/README.md")" -ge 4 ]]; then
  ok "README: разбор аргументов у каждой подкоманды"
else
  fail "README: нет разбора аргументов по подкомандам (ожидались таблицы «Аргумент | Обязателен | Что значит»)"
fi
# полнота §11: каждый флаг из CLI обязан встречаться в «Полном перечне команд»
SEC11=$(awk '/^## 11\./{f=1} /^## 12\./{f=0} f' "$ROOT/README.md")
if [[ -z "$SEC11" ]]; then
  fail "README: нет раздела 11 «Полный перечень команд»"
else
  MISSING=""
  for cli in sp.mjs sp-verify.mjs sp-retrieve.mjs; do
    while IFS= read -r flag; do
      grep -q -- "$flag" <<<"$SEC11" || MISSING="$MISSING $cli:$flag"
    done < <(grep -oE "a === '(--[a-z-]+|-h)'" "$ROOT/SEED/sp-tools/$cli" | grep -oE "(--[a-z-]+|-h)" | sort -u)
  done
  if [[ -n "$MISSING" ]]; then
    fail "README §11: флаги CLI не покрыты —$MISSING"
  else
    ok "README §11: покрывает все флаги sp / sp-verify / sp-retrieve"
  fi
  MISSING_SUB=""
  for sub in $(grep -oE "'(status|intake|next|decide|close|rules|doctor|update|verify|retrieve)'" "$ROOT/SEED/sp-tools/sp.mjs" | tr -d "'" | sort -u); do
    grep -qE "(sp|sp\.mjs|mjs) +$sub( +|$|\|)" <<<"$SEC11" || MISSING_SUB="$MISSING_SUB $sub"
  done
  if [[ -n "$MISSING_SUB" ]]; then
    fail "README §11: подкоманды sp не покрыты —$MISSING_SUB"
  else
    ok "README §11: покрывает все подкоманды sp"
  fi
fi
if grep -q '| Аргумент | Где | Что значит |' "$ROOT/SEED/sp-tools/USAGE.md"; then
  ok "USAGE: таблица аргументов подкоманд sp"
else
  fail "USAGE: нет таблицы аргументов подкоманд sp"
fi
if grep -q '^## 10\. Все команды управления' "$ROOT/README.md" \
  && grep -q '(#10-все-команды-управления)' "$ROOT/README.md" \
  && grep -q 'sp.mjs update' "$ROOT/README.md" \
  && grep -q 'sp-retrieve --reindex' "$ROOT/README.md"; then
  ok "README §10: полный справочник команд"
else
  fail "README §10 (все команды управления) отсутствует или неполный"
fi
if grep -q 'корень канона' "$ROOT/SEED/sp-tools/USAGE.md" \
  && grep -q '\.witness-done-work' "$ROOT/SEED/sp-tools/USAGE.md"; then
  ok "USAGE описывает режим корня канона"
else
  fail "USAGE не описывает режим корня канона"
fi

AGENT_MANIFEST="$ROOT/SEED/agent-config/manifest.json"
if [[ -f "$AGENT_MANIFEST" ]]; then
  ok "SEED/agent-config/manifest.json"
  for t in cursorrules cursor-mdc claude gemini copilot cline devin aider cmd-cursor; do
    if grep -q "\"id\": \"$t\"" "$AGENT_MANIFEST"; then
      ok "adapter target: $t"
    else
      fail "adapter target missing: $t"
    fi
  done
  if grep -q '"forbidden"' "$AGENT_MANIFEST" && grep -q '"\.rules"' "$AGENT_MANIFEST"; then
    ok "manifest forbids .rules (Zed shadowing)"
  else
    fail "manifest does not forbid .rules"
  fi
else
  fail "SEED/agent-config/manifest.json missing"
fi
for tpl in CLAUDE.md.tpl sp.toml.tpl; do
  [[ -f "$ROOT/SEED/agent-config/templates/$tpl" ]] && ok "agent-config template: $tpl" || fail "agent-config template missing: $tpl"
done
for tpl in entry-protocol intake decision-log decision-record manifest; do
  [[ -f "$ROOT/TEMPLATES/$tpl.md" ]] && ok "TEMPLATES/$tpl.md" || fail "TEMPLATES/$tpl.md missing"
done
[[ -f "$ROOT/SEED/git-hooks/pre-commit" ]] && ok "SEED/git-hooks/pre-commit" || fail "pre-commit hook missing"
if grep -q 'doctor --staged' "$ROOT/SEED/git-hooks/pre-commit"; then
  ok "pre-commit runs sp doctor --staged"
else
  fail "pre-commit does not run sp doctor --staged"
fi

for f in AGENTS.md SEED/cursorrules.template.md SEED/cursorrules.baseline.md; do
  if grep -q 'SP-ENTRY-PROTOCOL v1' "$ROOT/$f"; then
    ok "entry protocol block in $f"
  else
    fail "entry protocol block missing in $f"
  fi
done
if grep -q 'SP-ENTRY-PROTOCOL' "$ROOT/TEMPLATES/entry-protocol.md" \
  && grep -q '/SP-ENTRY-PROTOCOL' "$ROOT/TEMPLATES/entry-protocol.md"; then
  ok "entry-protocol template has open/close markers"
else
  fail "entry-protocol template missing markers"
fi

if grep -q 'sp.mjs' "$ROOT/SEED/ci.yml.example" \
  && grep -q 'rules --check' "$ROOT/SEED/ci.yml.example" \
  && grep -q 'doctor --strict' "$ROOT/SEED/ci.yml.example"; then
  ok "CI example runs rules --check + doctor --strict"
else
  fail "CI example missing entry gates"
fi
if grep -q 'sp.mjs doctor' "$ROOT/PIPELINE/10b_self_audit.md" \
  && grep -q 'sp.mjs rules' "$ROOT/PIPELINE/10b_self_audit.md" \
  && grep -q 'Трассируемость' "$ROOT/PIPELINE/10b_self_audit.md"; then
  ok "10b requires doctor/rules + traceability axis"
else
  fail "10b missing doctor/rules or traceability axis"
fi
if grep -q 'rules --sync' "$ROOT/PIPELINE/00_bootstrap.md" \
  && grep -q 'project-root\|PROJECT_ROOT/AGENTS.md\|`PROJECT_ROOT/AGENTS.md`' "$ROOT/PIPELINE/00_bootstrap.md"; then
  ok "step 00 writes AGENTS.md + adapters"
else
  fail "step 00 missing entry protocol wiring"
fi
if grep -q 'Intake' "$ROOT/PIPELINE/R02_propose_change.md" \
  && grep -q 'Intake' "$ROOT/TEMPLATES/change-proposal.md"; then
  ok "R02 binds change → intake"
else
  fail "R02/proposal missing intake binding"
fi
if grep -q 'sp.mjs intake' "$ROOT/PIPELINE/00_bootstrap.md" \
  || grep -q 'intake' "$ROOT/PIPELINE/00_bootstrap.md"; then
  ok "step 00 creates intake/ and decisions.md"
else
  fail "step 00 does not create intake/decisions"
fi

if grep -q '### sp — единый вход' "$ROOT/SEED/sp-tools/USAGE.md" \
  && grep -q 'doctor' "$ROOT/SEED/sp-tools/USAGE.md" \
  && grep -q 'rules --sync' "$ROOT/SEED/sp-tools/USAGE.md" \
  && grep -q 'sp next' "$ROOT/SEED/sp-tools/USAGE.md"; then
  ok "USAGE documents sp subcommands"
else
  fail "USAGE missing sp subcommands"
fi
if grep -q 'sp.mjs --help\|sp.mjs status' "$ROOT/README.md" \
  && grep -q 'Установка и размещение' "$ROOT/README.md" \
  && grep -q 'Вход в проект' "$ROOT/README.md" \
  && grep -q 'Правила для агентов' "$ROOT/README.md"; then
  ok "README covers install/entry/rules"
else
  fail "README missing install/entry/rules sections"
fi
if grep -n 'cd witness-done' "$ROOT/README.md" "$ROOT/run.sh" 2>/dev/null | grep -v 'не нужно' | grep -q .; then
  fail "docs still instruct 'cd witness-done && ./validate.sh'"
else
  ok "no stale 'cd witness-done' instructions"
fi

ORCH_COUNT=$(find "$ROOT" -name ORCHESTRATOR.md -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l)
[[ "$ORCH_COUNT" -eq 1 ]] && ok "single ORCHESTRATOR.md" || fail "expected 1 ORCHESTRATOR.md, found $ORCH_COUNT"
for stray in OUTPUT/ORCHESTRATOR.md TEMPLATES/ORCHESTRATOR.md SEED/ORCHESTRATOR.md; do
  [[ -e "$ROOT/$stray" ]] && fail "$stray must not exist" || ok "no $stray"
done

[[ -e "$ROOT/OUTPUT/MANIFEST.md" ]] && fail "OUTPUT/MANIFEST.md must not exist (use TEMPLATES/manifest.md)" || ok "no OUTPUT/MANIFEST.md"
for stale in INPUT/TECH_SPEC.demo.md INPUT/DESIGN.example.html INPUT/design/PLACEHOLDER.md; do
  [[ -e "$ROOT/$stale" ]] && fail "$stale must be moved to TEMPLATES/" || ok "no $stale"
done
[[ -f "$ROOT/TEMPLATES/examples/TECH_SPEC.demo.md" ]] && ok "TEMPLATES/examples/TECH_SPEC.demo.md" || fail "TECH_SPEC demo missing in TEMPLATES/examples"
# История версий не ведётся: VERSION + git-теги + сообщения коммитов
if grep -qiE '^#{1,4} .*История версий' "$ROOT/README.md"; then
  fail "README содержит раздел «История версий» — история не ведётся (VERSION + теги + коммиты)"
else
  ok "README не ведёт историю версий"
fi
if grep -q '4b\|--gate d-prompt-quality' "$ROOT/README.md"; then
  ok "README documents quality gates"
else
  fail "README missing quality gates"
fi
if grep -q 'catalogs/intake-and-decisions.md' "$ROOT/ORCHESTRATOR.md" \
  && grep -q 'catalogs/agent-rules.md' "$ROOT/ORCHESTRATOR.md"; then
  ok "ORCHESTRATOR references entry/rules canon"
else
  fail "ORCHESTRATOR missing entry/rules canon refs"
fi
[[ -f "$ROOT/catalogs/intake-and-decisions.md" ]] && ok "catalogs/intake-and-decisions.md" || fail "intake canon missing"
[[ -f "$ROOT/catalogs/agent-rules.md" ]] && ok "catalogs/agent-rules.md" || fail "agent-rules canon missing"

[[ -f "$ROOT/SEED/sp-tools/selftest.sh" ]] && ok "SEED/sp-tools/selftest.sh" || fail "selftest.sh missing"

# Бренд (DEC-030): старое имя отсутствует полностью — в текстах, путях, именах файлов и папок.
# Литерал собран из частей, чтобы валидатор не находил сам себя.
OLD_BRAND='Spec''Proof'
if head -1 "$ROOT/AGENTS.md" | grep -q 'Witness Done' \
  && head -1 "$ROOT/README.md" | grep -q '^# Witness Done (v' \
  && grep -q 'Witness Done status' "$ROOT/SEED/sp-tools/sp.mjs"; then
  ok "бренд Witness Done в AGENTS/README/CLI"
else
  fail "бренд: AGENTS.md, заголовок README или вывод sp status всё ещё старые"
fi
STALE_BRAND=$(grep -rniF "${OLD_BRAND}" "$ROOT" \
  --exclude-dir=.git --exclude-dir=.witness-done-work --exclude-dir=.sp-cache \
  --exclude-dir=node_modules 2>/dev/null | wc -l || true)
if [[ "$STALE_BRAND" -eq 0 ]]; then
  ok "нет остатков бренда ${OLD_BRAND} ни в текстах, ни в адресах"
else
  fail "остался старый бренд ${OLD_BRAND} в $STALE_BRAND строк(ах)"
  grep -rniF "${OLD_BRAND}" "$ROOT" --exclude-dir=.git --exclude-dir=.witness-done-work \
    --exclude-dir=.sp-cache --exclude-dir=node_modules 2>/dev/null | head -3
fi

# Раскладка установки одна: <project>/witness-done/ — и в README, и в маршруте, который печатает CLI
if grep -q '<project>/witness-done/' "$ROOT/README.md" \
  && grep -q "INSTALL_ROUTE = 'установить фабрику в <project>/witness-done/" "$ROOT/SEED/sp-tools/sp.mjs"; then
  ok "путь установки <project>/witness-done/ согласован: README ↔ sp status"
else
  fail "путь установки разошёлся: README и INSTALL_ROUTE в sp.mjs"
fi
# Имя папки — не контракт: раскладка не может определяться через basename
if grep -q 'basename "\$ROOT"' "$ROOT/run.sh"; then
  fail "run.sh определяет раскладку по имени папки — должно быть по наличию OUTPUT/"
else
  ok "run.sh не зависит от имени папки фабрики"
fi
if grep -q '^\.witness-done-work/$' "$ROOT/.gitignore"; then
  ok ".witness-done-work/ в .gitignore"
else
  fail ".witness-done-work/ не игнорируется"
fi

# Адрес репозитория один: update.json (источник для sp update) и инструкции clone в README
REPO_PIN=$(node -e "process.stdout.write(require('$ROOT/SEED/update.json').repo)" 2>/dev/null || true)
if [[ -n "$REPO_PIN" ]] && grep -q "github.com/${REPO_PIN}.git" "$ROOT/README.md"; then
  ok "README и update.json согласованы: ${REPO_PIN}"
else
  fail "README и SEED/update.json расходятся по адресу репозитория (${REPO_PIN:-?})"
fi
if grep -q 'Аналогия: фабрика — это не автор' "$ROOT/README.md"; then
  ok "README сохраняет позиционирование (фабрика/технадзор)"
else
  fail "README потерял позиционирование после смены бренда"
fi
[[ -f "$ROOT/logo.jpg" ]] && ok "логотип logo.jpg" || fail "logo.jpg missing"
if grep -q 'src="logo.jpg"' "$ROOT/README.md"; then
  ok "README использует logo.jpg"
else
  fail "README ссылается не на logo.jpg"
fi
[[ -e "$ROOT/${OLD_BRAND}.jpg" ]] && fail "старый ${OLD_BRAND}.jpg не удалён" || ok "старый логотип удалён"

# Связь «фраза ACCEPTANCE ↔ тест» — машинная (v1.27, DEC-027)
[[ -f "$ROOT/SEED/sp-tools/acceptance-bind.mjs" ]] && ok "acceptance-bind.mjs" || fail "acceptance-bind.mjs missing"
node --check "$ROOT/SEED/sp-tools/acceptance-bind.mjs" 2>/dev/null \
  && ok "acceptance-bind.mjs синтаксис" || fail "acceptance-bind.mjs не парсится"
if node "$ROOT/SEED/sp-tools/sp-verify.mjs" --help 2>&1 | grep -q -- '--gate acceptance'; then
  ok "sp-verify знает гейт acceptance"
else
  fail "sp-verify help не упоминает --gate acceptance"
fi
if grep -q '@acceptance' "$ROOT/TEMPLATES/dev-prompt.md" \
  && grep -q 'acceptance_ops' "$ROOT/TEMPLATES/dev-prompt.md" \
  && grep -q 'acceptance' "$ROOT/catalogs/verification-tax.md" \
  && grep -q '@acceptance' "$ROOT/catalogs/typing-and-tests.md"; then
  ok "канон описывает объявление фразы тестом"
else
  fail "канон не описывает связь «фраза ↔ тест»"
fi
[[ -f "$ROOT/TEMPLATES/test-plan.md" ]] && ok "TEMPLATES/test-plan.md" || fail "TEMPLATES/test-plan.md missing"

# --- 1.17: ссылки в документации живые, путь CLI один (DEC-034) ---
STALE=$(grep -rnE 'node +scripts/sp-tools/' "$ROOT/TEMPLATES" "$ROOT/PIPELINE" "$ROOT/SEED" \
        --include='*.md' --include='*.example' 2>/dev/null | grep -v '/\.witness-done-work/' || true)
if [[ -z "$STALE" ]]; then
  ok "DEC-034: ни один шаблон/пайплайн/CI не зовёт CLI по устаревшему пути scripts/sp-tools"
else
  fail "DEC-034: устаревший путь запуска CLI (нужен witness-done/SEED/sp-tools/):"
  echo "$STALE" | head -5 | sed 's/^/       /'
fi
BROKEN=""
while IFS= read -r ref; do
  [[ -f "$ROOT/$ref" ]] || BROKEN="$BROKEN $ref"
done < <(grep -rhoE '(catalogs|TEMPLATES|PIPELINE)/[A-Za-z0-9._-]+\.md' "$ROOT/README.md" \
          "$ROOT/TEMPLATES" "$ROOT/PIPELINE" "$ROOT/catalogs" "$ROOT/SEED" 2>/dev/null \
          | grep -v '/\.witness-done-work/' | sort -u)
if [[ -z "$BROKEN" ]]; then
  ok "ссылки на catalogs/ TEMPLATES/ PIPELINE/ из документации существуют"
else
  fail "битые ссылки в документации:$BROKEN"
fi
if [[ "${SP_SKIP_SELFTEST:-0}" == "1" ]]; then
  echo "  SKIP selftest sp.mjs (SP_SKIP_SELFTEST=1)"
elif command -v node >/dev/null 2>&1; then
  SELFTEST_LOG=$(mktemp "${TMPDIR:-/tmp}/sp-selftest-log.XXXXXX")
  if bash "$ROOT/SEED/sp-tools/selftest.sh" > "$SELFTEST_LOG" 2>&1; then
    ok "selftest sp.mjs (классификация, правила, doctor)"
  else
    fail "selftest sp.mjs failed:"
    grep 'FAIL' "$SELFTEST_LOG" | head -10
  fi
  rm -f "$SELFTEST_LOG"
else
  echo "  SKIP selftest sp.mjs (node не найден)"
fi

echo
if [[ "$ERR" -eq 0 ]]; then
  echo "RESULT: PASS"
  exit 0
else
  echo "RESULT: FAIL"
  exit 1
fi
