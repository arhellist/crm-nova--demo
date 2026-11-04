# PIPELINE 05 — Security

## Роль

Ты — application security engineer. Строишь security-слой документации под конкретное ТЗ. Эксплойты и PoC **не писать** — только защита, политики, чеклисты.

## Вход

- ТЗ, analysis, architecture, data-model, openapi-outline
- `@witness-done/TEMPLATES/threat-model.md`
- модули `LIBRARY/` (если выбраны auth и т.п.)

## Создай

### 1. `OUTPUT/security/threat-model.md`

STRIDE-лайт по P0 активам: данные пользователей, сессии, платежи, админка…

Для каждой угрозы: риск, митигация, где в архитектуре закрывается.

### 2. `OUTPUT/security/authn-authz.md`

- Модель аутентификации (и ссылка на LIBRARY-модуль, если выбран)
- Роли / permissions matrix
- Правила владения ресурсами (IDOR prevention)
- Сессии/токены: хранение, ротация, logout all devices

### 3. `OUTPUT/security/checklist.md`

Перед релизом: OWASP ASVS-inspired короткий чеклист под этот стек.

### 4. `OUTPUT/security/secrets-and-config.md`

Какие секреты, куда класть, что нельзя в git, ротация.

### 5. `OUTPUT/security/data-protection.md`

PII, шифрование at rest/in transit, логи без секретов, retention.

## Обнови MANIFEST

## STOP

```text
SECURITY: OK
Следующий шаг: PIPELINE/06_nfr_scalability.md
```
