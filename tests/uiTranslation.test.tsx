import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useUiTranslation } from '../src/lib/useUiTranslation';
import { setLanguagePreference } from '../src/lib/useLanguage';

function Preview({ label, count = 1 }: { label: string; count?: number }) {
  useUiTranslation();
  return <><button aria-label={label}>{label}</button><span>{`${count} vietos`}</span></>;
}

afterEach(() => { cleanup(); localStorage.clear(); });

describe('live UI translations', () => {
  it('keeps React action and count changes in Lithuanian', async () => {
    const { rerender } = render(<Preview label="Atgal" />);
    rerender(<Preview label="Pranešimai" count={3} />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(screen.getByRole('button').textContent).toBe('Pranešimai');
    expect(screen.getByText('3 vietos')).toBeTruthy();
  });
  it('translates changed text and attributes and restores the latest Lithuanian values', async () => {
    setLanguagePreference('en');
    const { rerender } = render(<Preview label="Atgal" />);
    expect(screen.getByRole('button', { name: 'Back' }).textContent).toBe('Back');
    rerender(<Preview label="Pranešimai" count={3} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' }).textContent).toBe('Notifications'));
    expect(screen.getByText('3 seats')).toBeTruthy();
    act(() => setLanguagePreference('lt'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pranešimai' }).textContent).toBe('Pranešimai'));
    expect(screen.getByText('3 vietos')).toBeTruthy();
  });
});