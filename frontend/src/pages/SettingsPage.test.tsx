import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE, signedInBackend } from '@/test/fakeBackend';
import { renderApp } from '@/test/render';

afterEach(() => vi.unstubAllGlobals());

describe('settings page', () => {
  it('shows the account and the privacy information supplied by the server', async () => {
    signedInBackend(); renderApp('/app/settings');
    expect(await screen.findByText(FIXTURE.user.email)).toBeInTheDocument();
    expect(await screen.findByText(FIXTURE.info.privacy.storage[0])).toBeInTheDocument();
    expect(screen.getByText(/never the complaint texts/i)).toBeInTheDocument();
    expect(screen.getByText(/Files up to 500 MB/)).toBeInTheDocument();
  });
  describe('changing the password', () => {
    const fill = async (cur: string, next: string, again: string) => {
      await userEvent.type(await screen.findByLabelText('Current password'), cur);
      await userEvent.type(screen.getByLabelText('New password'), next);
      await userEvent.type(screen.getByLabelText('Repeat new password'), again);
      await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    };
    it('checks length and matching before calling the server', async () => {
      const b = signedInBackend(); renderApp('/app/settings');
      await fill('old password 1', 'short', 'short');
      expect(await screen.findByText(/needs at least 10 characters/)).toBeInTheDocument();
      await userEvent.clear(screen.getByLabelText('New password')); await userEvent.clear(screen.getByLabelText('Repeat new password'));
      await userEvent.type(screen.getByLabelText('New password'), 'a long new passphrase'); await userEvent.type(screen.getByLabelText('Repeat new password'), 'a different one here');
      await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
      expect(await screen.findByText('The new passwords do not match.')).toBeInTheDocument();
      expect(b.callsTo('POST', '/api/auth/password')).toHaveLength(0);
    });
    it('confirms success and clears the fields', async () => {
      const b = signedInBackend().on('POST /api/auth/password', { status: 204 }); renderApp('/app/settings');
      await fill('old password 1', 'a long new passphrase', 'a long new passphrase');
      expect(await screen.findByText('Your password was changed.')).toBeInTheDocument();
      expect(b.callsTo('POST', '/api/auth/password')[0].body).toEqual({ current_password: 'old password 1', new_password: 'a long new passphrase' });
      expect(screen.getByLabelText('Current password')).toHaveValue('');
    });
    it('shows the server message for a wrong current password', async () => {
      signedInBackend().on('POST /api/auth/password', { status: 403, json: { detail: 'Current password is incorrect.' } }); renderApp('/app/settings');
      await fill('wrong one 12', 'a long new passphrase', 'a long new passphrase');
      expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument();
      expect(screen.queryByText('Your password was changed.')).toBeNull();
    });
  });
  describe('deleting the account', () => {
    const open = async () => { await userEvent.click(await screen.findByRole('button', { name: 'Delete my account' })); };
    it('needs the password and can be cancelled', async () => {
      const b = signedInBackend(); renderApp('/app/settings'); await open();
      await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
      expect(await screen.findByText('Enter your password to confirm.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(b.callsTo('DELETE', '/api/auth/account')).toHaveLength(0);
    });
    it('deletes, signs out and returns to the landing page', async () => {
      const b = signedInBackend().on('DELETE /api/auth/account', { status: 204 }).on('POST /api/auth/logout', { status: 204 });
      renderApp('/app/settings'); await open();
      await userEvent.type(screen.getByLabelText('Password'), 'a long fixture passphrase');
      await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
      expect(await screen.findByRole('heading', { name: /what your customers keep complaining about/i })).toBeInTheDocument();
      expect(b.callsTo('DELETE', '/api/auth/account')[0].body).toEqual({ password: 'a long fixture passphrase' });
    });
    it('keeps the account and shows the reason when the password is wrong', async () => {
      signedInBackend().on('DELETE /api/auth/account', { status: 403, json: { detail: 'Password is incorrect.' } });
      renderApp('/app/settings'); await open();
      await userEvent.type(screen.getByLabelText('Password'), 'not my password');
      await userEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
      expect(await screen.findByText('Password is incorrect.')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument());
    });
  });
});
