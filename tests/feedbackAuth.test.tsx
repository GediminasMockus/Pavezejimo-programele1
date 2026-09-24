import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppFeedback } from '../src/components/AppFeedback';
import { AuthScreen, PasswordRecoveryScreen } from '../src/components/AuthScreen';

const mocks = vi.hoisted(() => ({
  insert: vi.fn().mockResolvedValue({ error: null }),
  resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  updateUser: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('../src/lib/supabase', () => ({ supabase: {
  from: () => ({ insert: mocks.insert }),
  auth: { resetPasswordForEmail: mocks.resetPasswordForEmail, updateUser: mocks.updateUser, signOut: vi.fn() },
} }));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe('early user feedback and account recovery', () => {
  it('sends a problem with screen context but no reset token in its URL', async () => {
    window.history.replaceState(null, '', '/?access_token=secret');
    render(<AppFeedback screen="list" role="passenger" />);
    fireEvent.click(screen.getByRole('button', { name: 'Siųsti atsiliepimą apie programėlę' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Jūsų žinutė' }), { target: { value: 'Nerandu kelionės' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siųsti atsiliepimą' }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      category: 'problem', message: 'Nerandu kelionės', screen: 'list', role: 'passenger',
      page_url: `${window.location.origin}/`,
    })));
    expect(screen.getByText('Ačiū! Atsiliepimas išsiųstas.')).toBeTruthy();
  });

  it('requires a rating and accepts a rating without a comment', async () => {
    render(<AppFeedback screen="home" role={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Siųsti atsiliepimą apie programėlę' }));
    fireEvent.click(screen.getByRole('button', { name: 'Įvertinti programėlę' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siųsti atsiliepimą' }));
    expect(screen.getByRole('alert').textContent).toContain('Pasirinkite įvertinimą');
    expect(mocks.insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '4 / 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siųsti atsiliepimą' }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ category: 'rating', rating: 4, message: '' })));
  });

  it('sends a password reset email and saves the new password from a recovery session', async () => {
    render(<AuthScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Pamiršote slaptažodį?' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'El. paštas' }), { target: { value: 'test@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siųsti atkūrimo nuorodą' }));
    await waitFor(() => expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', { redirectTo: 'https://pavezejimo-programele1.vercel.app/' }));
    cleanup();
    const onComplete = vi.fn();
    render(<PasswordRecoveryScreen onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Naujas slaptažodis'), { target: { value: 'saugus-slaptazodis' } });
    fireEvent.change(screen.getByLabelText('Pakartokite slaptažodį'), { target: { value: 'saugus-slaptazodis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti slaptažodį' }));
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'saugus-slaptazodis' }));
    expect(onComplete).toHaveBeenCalled();
  });
});
