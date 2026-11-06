/**
 * PostCSS для Vite-сборки SPA.
 *
 * Без этого файла директивы `@tailwind` из `src/styles/tokens.css` попадают в `dist/web`
 * как сырой текст (~1 КБ), утилиты не генерируются — UI «слипается» (нет flex/gap/padding).
 * Инвариант change ui-spacing-density: production CSS обязан содержать утилиты и не содержать
 * литералы `@tailwind`.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
