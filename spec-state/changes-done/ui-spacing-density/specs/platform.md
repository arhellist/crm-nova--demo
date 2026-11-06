# Delta Spec: platform — ui-spacing-density

## ADDED Requirements

### Requirement: Стили SPA собираются через PostCSS+Tailwind по design-notes

Система MUST обрабатывать директивы `@tailwind` через PostCSS (`tailwindcss`, `autoprefixer`)
при `vite build` SPA и SHALL класть в `dist/web` CSS, содержащий утилитарные классы из
`src/**/*.{ts,tsx}` (как минимум `flex`, `gap`, отступы `p`/`px`/`py`). Токены `:root` MUST
совпадать с `OUTPUT/docs/design-notes.md`; шрифты Inter и JetBrains Mono MUST подключаться
локально без CDN. Сырые литералы `@tailwind base|components|utilities` MUST NOT оставаться
в production CSS.

#### Scenario: happy path
- GIVEN зависимости `tailwindcss`, `postcss`, `autoprefixer` установлены и есть `postcss.config.cjs`
- WHEN выполняется production-сборка SPA (`npm run build:web` или эквивалент)
- THEN файл CSS в `dist/web/assets/` содержит классы утилит (например `.flex`, `.gap-4`) и
      НЕ содержит текст `@tailwind base`

#### Scenario: negative / boundary — сборка без PostCSS
- GIVEN конфигурация PostCSS отсутствует или не подключает `tailwindcss`
- WHEN выполняется production-сборка SPA
- THEN либо сборка/проверка падает с понятной ошибкой, либо автотест стилей фиксирует
      наличие сырых `@tailwind` директив как дефект (нельзя принять релиз с «слипшимся» UI)

## MODIFIED Requirements

<!-- нет -->

## REMOVED Requirements

<!-- нет -->
