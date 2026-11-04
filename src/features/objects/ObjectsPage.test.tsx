// @vitest-environment jsdom
/**
 * Тесты экрана объектов: пагинация курсором, роль исполнителя, архивная карточка и пустое состояние.
 *
 * @acceptance A06.1
 * @acceptance A06.2
 * @acceptance A06.5
 * @acceptance A06.6
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ObjectsPage } from './ObjectsPage.js';
import * as api from './api.js';
import * as sessionModule from '../auth/useSession.js';
import type { ObjectRow } from './types.js';

vi.mock('./api.js', () => ({
  listObjects: vi.fn(),
  getObject: vi.fn(),
  createObject: vi.fn(),
  updateObject: vi.fn(),
}));

vi.mock('./mutations.js', () => ({
  archiveObject: vi.fn(),
}));

vi.mock('../auth/useSession.js', () => ({
  useSession: vi.fn(),
}));

function row(index: number, overrides: Partial<ObjectRow> = {}): ObjectRow {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `Объект ${String(index).padStart(2, '0')}`,
    address: `Улица Строителей, ${index}`,
    created_at: '2026-11-01T10:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

function sessionFor(role: 'manager' | 'executor'): sessionModule.UseSessionResult {
  return {
    status: 'authenticated',
    email: null,
    profile: {
      id: role === 'manager' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
      full_name: role === 'manager' ? 'Ирина Волкова' : 'Пётр Смирнов',
      role,
    },
    refresh: vi.fn(async () => undefined),
  };
}

function renderPage(path = '/objects'): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/objects" element={<ObjectsPage />} />
          <Route path="/objects/:id" element={<ObjectsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(sessionModule.useSession).mockReturnValue(sessionFor('manager'));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ObjectsPage', () => {
  it('A06.1 25 объектов: первые 20 строк, «Показать ещё» добавляет остальные без дублей', async () => {
    const rows = Array.from({ length: 25 }, (_, index) => row(index + 1));
    vi.mocked(api.listObjects).mockImplementation(async (params = {}) => {
      if (!params.cursor) {
        const cursorRow = rows.at(19);
        if (!cursorRow) {
          return { items: rows, nextCursor: null };
        }
        return { items: rows.slice(0, 20), nextCursor: { title: cursorRow.title, id: cursorRow.id } };
      }
      return { items: rows.slice(20), nextCursor: null };
    });

    renderPage();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(20));

    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(25));
    const titles = screen.getAllByRole('link', { name: /^Объект \d{2}$/ }).map((link) => link.textContent);
    expect(new Set(titles).size).toBe(25);
    const limits = vi.mocked(api.listObjects).mock.calls.map(([params]) => params?.limit ?? 0);
    expect(limits.every((limit) => limit <= 20)).toBe(true);
  });

  it('A06.2 исполнитель: нет кнопок управления, доступные объекты видны', async () => {
    vi.mocked(sessionModule.useSession).mockReturnValue(sessionFor('executor'));
    vi.mocked(api.listObjects).mockResolvedValue({ items: [row(1), row(2)], nextCursor: null });

    renderPage();

    expect(await screen.findByRole('link', { name: 'Объект 01' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Создать объект' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Изменить объект/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Архивировать объект/ })).toBeNull();
  });

  it('A06.5 архивный объект: данные и задачи видны, управления нет', async () => {
    vi.mocked(api.getObject).mockResolvedValue(
      row(7, { title: 'ЖК Северные Линии', archived_at: '2026-11-02T08:00:00Z' }),
    );

    renderPage('/objects/00000000-0000-4000-8000-000000000007');

    expect(await screen.findByRole('heading', { name: 'ЖК Северные Линии' })).toBeTruthy();
    expect(screen.getByText('Архив')).toBeTruthy();
    expect(screen.getByText('Улица Строителей, 7')).toBeTruthy();
    expect(screen.getByText('Задачи загружаются')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Изменить объект' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Архивировать объект' })).toBeNull();
  });

  it('A06.6 пустой список: текст и действие вместо пустой таблицы', async () => {
    vi.mocked(api.listObjects).mockResolvedValue({ items: [], nextCursor: null });

    renderPage();

    expect(await screen.findByText('Объектов пока нет')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Создать объект' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Список объектов' })).toBeNull();
  });
});
