/**
 * Точка входа SPA (D04, DEC-011).
 *
 * Здесь собираются провайдеры: QueryClient для кэша профиля/домена и BrowserRouter для guard'ов.
 * Стили подключаются один раз из tokens.css (единственный источник дизайн-токенов).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './app/router.js';
import './styles/tokens.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 401 обрабатывается одним refresh в useSession; скрытые ретраи TanStack не нужны.
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Не найден корневой элемент #root');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
