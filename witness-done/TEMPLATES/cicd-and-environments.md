# CI/CD и окружения — {{PROJECT_NAME}}

> Сгенерировано Witness Done v{{VERSION}}  
> Канон: `catalogs/cicd-environments.md`

## Окружения

| Env | URL / хост | Ветки / теги | БД | Внешние API |
|-----|------------|--------------|-----|-------------|
| local | localhost | — | docker | mocks |
| ci | — | PR | service container | mocks |
| staging | … | main / staging-* | staging | sandbox |
| production | … | tag v* + approval | prod | live |

## Пайплайны

### PR

1. checkout  
2. install  
3. lint  
4. test (если есть)  
5. **не** deploy

### Staging

1. checks как PR  
2. migrate (expand)  
3. deploy api → workers → web  
4. smoke: health, metrics, ключевая страница  
5. wave API-smoke затронутого контура (`scripts/smoke/wave-*.sh`)  
6. внешний OLAP/PSP: живой прогон, если фича зависит (не только memory fixture)

### Production

1. manual approval  
2. `sp-verify --gate pre_release`  
3. migrate  
4. deploy в том же порядке  
5. полный product-smoke (`docs/runbooks/product-smoke.md`) + rollback plan

## Порядок развёртывания (runtime)

1. …  
2. …  

## Secrets

См. `env-vars.md` + `OUTPUT/security/secrets-and-config.md`. Prod ≠ staging.

## Rollback

- …
