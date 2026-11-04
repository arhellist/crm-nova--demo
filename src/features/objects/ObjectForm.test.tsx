// @vitest-environment jsdom
/**
 * Тесты формы объекта: пустое название отсекается до сети.
 *
 * @acceptance A06.3
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ObjectForm } from './ObjectForm.js';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ObjectForm', () => {
  it('A06.3 пустое название: ошибка поля, отправки на сервер нет', async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(<ObjectForm mode="create" onCancel={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Укажите название')).toBeTruthy();
    expect(screen.getByText('Укажите адрес')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
