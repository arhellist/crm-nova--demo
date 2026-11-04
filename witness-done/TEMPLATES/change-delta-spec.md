# Delta Spec: {{CHANGE_ID}} — {{TITLE}}

> Домен: `{{DOMAIN}}`  
> Baseline: `spec-state/baseline/{{DOMAIN}}/spec.md`  
> Правило: Изменения вносятся строго через дельту. Секция MODIFIED заменяет требование целиком.

## ADDED Requirements

### Requirement: {{REQ_NAME}}
Система MUST {{ОПИСАНИЕ_ТРЕБОВАНИЯ}}.
Компоненты SHALL {{ДОПОЛНИТЕЛЬНОЕ_ТРЕБОВАНИЕ}}.

#### Scenario: {{SCENARIO_NAME}}
- GIVEN {{ПРЕДУСЛОВИЕ}}
- WHEN {{ДЕЙСТВИЕ}}
- THEN {{ОЖИДАЕМЫЙ_РЕЗУЛЬТАТ}}

## MODIFIED Requirements

### Requirement: {{EXISTING_REQ_NAME}}
Система MUST {{ПОЛНАЯ_НОВАЯ_ВЕРСИЯ_ТРЕБОВАНИЯ}}.
Каждое модифицированное требование SHALL полностью заменять предыдущую формулировку в baseline со всеми сценариями.

#### Scenario: {{SCENARIO_NAME}}
- GIVEN {{ПРЕДУСЛОВИЕ}}
- WHEN {{ДЕЙСТВИЕ}}
- THEN {{ОЖИДАЕМЫЙ_РЕЗУЛЬТАТ}}

## REMOVED Requirements

### Requirement: {{EXISTING_REQ_NAME_TO_REMOVE}}
**Причина удаления:** {{ОБОСНОВАНИЕ_УДАЛЕНИЯ_ТРЕБОВАНИЯ_И_ССЫЛКА_НА_PROPOSAL}}
