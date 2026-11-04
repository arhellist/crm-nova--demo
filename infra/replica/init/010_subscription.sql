-- 010_subscription.sql
-- Подписка replica → primary на публикацию `nova_pub` (ADR-0003).
--
-- Инварианты:
--  - строка подключения к primary приходит psql-переменной `replicator_conninfo` из окружения
--    (`REPLICATOR_CONNINFO`); в git, образе и файле её нет (INV-006);
--  - подписка создаётся один раз: повторный запуск init-контура не дублирует данные
--    (`copy_data = true` только при первичном создании, A10.1);
--  - `create_slot = true` — слот заводится на primary этой же командой; вручную слоты
--    не создаются и не удаляются (ADR-0003, D10 инвариант 7);
--  - публикация `nova_pub` создаётся миграцией 0008 на primary, здесь только подписка.
--
-- CREATE SUBSCRIPTION нельзя выполнять внутри транзакции, поэтому идемпотентность сделана
-- через `\gexec`: psql выполнит команду отдельным оператором, только если подписки ещё нет.

\set ON_ERROR_STOP on

select format(
  'create subscription nova_sub connection %L publication nova_pub '
  'with (copy_data = true, create_slot = true)',
  :'replicator_conninfo'
)
where not exists (select 1 from pg_subscription where subname = 'nova_sub')
\gexec
