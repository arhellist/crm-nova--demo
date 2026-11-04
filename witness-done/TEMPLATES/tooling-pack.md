# Tooling pack expectations (PIPELINE/08)

## Primary (must land in PROJECT_ROOT)

По стеку:

- JS/TS: `.eslintrc.js` + `eslint-plugin-local-rules/` + scripts `lint`
- Go: `.golangci.yml`
- Java: checkstyle/spotless в build
- CI: `.github/workflows/ci.yml` (lint/test на PR; deploy только protected)

## Also under OUTPUT/tooling/

| Файл | Обязателен |
|------|------------|
| `install-order.md` | да |
| `lint-setup.md` | да |
| **`cicd-and-environments.md`** | **да** (v1.7+) |
| `deploy.md` | да |
| `env-vars.md` (по env) | да |
| `ci.yml.example` | да |
| `observability.md` | по NFR |
| `dependency-policy.md`, `pre-commit.md` | да |
| `tsconfig.strict-notes.md` | если TS |

Prefer copy-paste ready content over narrative advice.
Канон окружений: `catalogs/cicd-environments.md`.
