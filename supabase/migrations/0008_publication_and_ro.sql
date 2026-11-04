-- 0008_publication_and_ro.sql
-- Контур чтения отчётов: публикация изменений и роль nova_ro на primary.
--
-- Инварианты:
--  - публикуются ровно четыре таблицы (`profiles`, `objects`, `tasks`, `task_status_history`);
--    новая таблица попадает в отчётность только новой миграцией, не вручную (D10, INV-011);
--  - `publish = 'insert,update,delete'`: удаление доменных строк не используется (архивирование —
--    это UPDATE `archived_at`), но публикация обязана совпадать с DDL миграций;
--  - `nova_ro` — только чтение: перед выдачей `select` снимаем все права на таблицы схемы,
--    затем выдаём `usage` и `select` на четыре таблицы; `default_transaction_read_only = on`
--    превращает любую попытку записи в `25006` (A10.4);
--  - пароль роли в файле не хранится (INV-006): его ставит менеджер секретов
--    (`ALTER ROLE nova_ro PASSWORD …` из `NOVA_RO_PASSWORD`), как требует security/secrets-and-config.md.
--
-- Миграция идемпотентна (NFR19): публикация и роль создаются только при отсутствии.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'nova_pub') then
    create publication nova_pub
      for table public.profiles, public.objects, public.tasks, public.task_status_history
      with (publish = 'insert,update,delete');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nova_ro') then
    -- LOGIN нужен для подключения отчётного API, NOINHERIT — чтобы членство в других ролях
    -- не расширяло права неявно.
    create role nova_ro login noinherit;
  end if;
end
$$;

-- Единственная запись, которую роль `nova_ro` может «попытаться» сделать, — read-only транзакция
-- отклоняет её с 25006 ещё до проверки грантов.
alter role nova_ro set default_transaction_read_only = on;

-- Порядок важен: сначала снимаем всё, потом выдаём чтение ровно на четыре таблицы.
revoke all on all tables in schema public from nova_ro;
grant usage on schema public to nova_ro;
grant select on table public.profiles, public.objects, public.tasks, public.task_status_history
  to nova_ro;
