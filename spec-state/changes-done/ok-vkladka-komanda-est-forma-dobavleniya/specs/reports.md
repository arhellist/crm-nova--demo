# Delta: reports — KPI менеджеров

## ADDED Requirements

### Requirement: Отчёт и карточки менеджеров по авторским задачам

Система MUST отдавать агрегат по каждому `profiles.role = manager`: счётчики задач
по статусам (автор = менеджер, неархивные) и `accepted_share`. UI «Команда» MUST
показывать карточку на каждого менеджера, включая нулевые счётчики. Email MUST NOT
входить в ответ.

#### Scenario: happy path
- GIVEN менеджер с принятыми и открытыми задачами
- WHEN открыта «Команда»
- THEN карточка содержит ФИО, tasks_total и accepted_share

#### Scenario: negative — менеджер без задач
- GIVEN новый менеджер без задач
- WHEN открыта «Команда»
- THEN карточка есть, счётчики нули, accepted_share = 0
