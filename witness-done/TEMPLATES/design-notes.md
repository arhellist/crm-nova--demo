# Design notes — {{PROJECT_NAME}}

> Сгенерировано Witness Done v{{VERSION}}  
> Источник: `INPUT/DESIGN.html` и/или `INPUT/design/*.html`  
> Канон: `catalogs/design-input.md`

## Статус входа

| Поле | Значение |
|------|----------|
| design_input | present \| none |
| Файлы | … |

## Токены (CSS variables — целевые имена)

```css
:root {
  --color-bg: …;
  --color-surface: …;
  --color-text: …;
  --color-accent: …;
  --font-sans: …;
  --radius-md: …;
  --space-unit: …;
}
```

## Типографика и сетка

- …

## Компоненты-референсы из HTML

| Компонент | Как выглядит в HTML | Как переносить в UI |
|-----------|---------------------|---------------------|
| Button primary | … | … |

## Экраны

| HTML файл | Экран продукта | D-промпт |
|-----------|----------------|----------|
| … | … | D0x |

## Запреты для агента

- Не подменять палитру/шрифты «дефолтным AI UI».
- Отклонения только с записью здесь + причиной (a11y, SSR).
