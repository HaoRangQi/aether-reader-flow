import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetConfig } from './BudgetConfig';
import { useConfigStore } from '@/stores/configStore';

const initialConfigState = useConfigStore.getState();

describe('BudgetConfig', () => {
  beforeEach(() => {
    useConfigStore.setState({
      ...initialConfigState,
      budgetCNY: 300,
      setBudget: vi.fn(async (budgetCNY: number) => {
        useConfigStore.setState({ budgetCNY });
      }),
    });
  });

  it('labels the monthly budget input and connects help text', () => {
    render(<BudgetConfig />);

    const input = screen.getByRole('spinbutton', { name: '月度 AI 调用预算' });
    expect(input).toHaveAccessibleDescription(/一本 30 万字金融科普书/);
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('marks invalid budgets and disables saving', async () => {
    const user = userEvent.setup();
    render(<BudgetConfig />);

    const input = screen.getByRole('spinbutton', { name: '月度 AI 调用预算' });
    await user.clear(input);
    await user.type(input, '0');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('请输入大于 0 的月度预算。');
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('saves valid budgets and announces feedback', async () => {
    const user = userEvent.setup();
    render(<BudgetConfig />);

    const input = screen.getByRole('spinbutton', { name: '月度 AI 调用预算' });
    await user.clear(input);
    await user.type(input, '420');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(useConfigStore.getState().setBudget).toHaveBeenCalledWith(420);
    expect(screen.getByRole('status')).toHaveTextContent('已保存');
  });

  it('announces save failures and keeps the edited budget value', async () => {
    const user = userEvent.setup();
    useConfigStore.setState({
      setBudget: vi.fn(async () => {
        throw new Error('IndexedDB 写入失败');
      }),
    });
    render(<BudgetConfig />);

    const input = screen.getByRole('spinbutton', { name: '月度 AI 调用预算' });
    await user.clear(input);
    await user.type(input, '520');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '预算保存失败：IndexedDB 写入失败',
    );
    expect(input).toHaveValue(520);
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
  });

  it('disables editing while saving a budget', async () => {
    const user = userEvent.setup();
    let resolveSave: (() => void) | undefined;
    useConfigStore.setState({
      setBudget: vi.fn(
        () => new Promise<void>(resolve => {
          resolveSave = resolve;
        }),
      ),
    });
    render(<BudgetConfig />);

    const input = screen.getByRole('spinbutton', { name: '月度 AI 调用预算' });
    await user.clear(input);
    await user.type(input, '640');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
    expect(input).toBeDisabled();
    expect(useConfigStore.getState().setBudget).toHaveBeenCalledTimes(1);

    resolveSave?.();

    expect(await screen.findByRole('status')).toHaveTextContent('已保存');
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    expect(input).toBeEnabled();
  });
});
