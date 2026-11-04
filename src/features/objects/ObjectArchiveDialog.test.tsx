// @vitest-environment jsdom
/**
 * Тесты диалога архивирования: подтверждение отправляет ровно один запрос.
 *
 * @acceptance A06.4
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ObjectArchiveDialog } from './ObjectArchiveDialog.js';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ObjectArchiveDialog', () => {
  it('A06.4 двойной клик по «Архивировать» вызывает RPC один раз', async () => {
    const onConfirm = vi.fn(() => new Promise<void>(() => undefined));
    render(
      <ObjectArchiveDialog
        object={{ title: 'ЖК Северные Линии' }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/Объект и его задачи останутся в истории/)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Архивировать' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
