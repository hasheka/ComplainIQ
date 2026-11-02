import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anonymousBackend, FIXTURE, signedInBackend, DATASET_ID } from '@/test/fakeBackend';
import { renderApp } from '@/test/render';

afterEach(() => vi.unstubAllGlobals());

describe('route protection', () => {
  it('sends a visitor who is not signed in to the login page', async () => {
    anonymousBackend(); renderApp('/app/data');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
  it('sends a signed-in visitor away from the login page', async () => {
    signedInBackend(); renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Executive Dashboard' })).toBeInTheDocument();
  });
  it('shows the landing page to everyone, with the right call to action', async () => {
    anonymousBackend(); const { unmount } = renderApp('/');
    expect(await screen.findByRole('heading', { name: /what your customers keep complaining about/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create a free account/i })).toHaveAttribute('href', '/register');
    unmount(); signedInBackend(); renderApp('/');
    expect(await screen.findAllByRole('link', { name: /open dashboard/i })).not.toHaveLength(0);
  });
  it('contains no invented testimonials or statistics', async () => {
    anonymousBackend(); renderApp('/');
    await screen.findByRole('heading', { name: /what you can do/i });
    expect(document.body.textContent).not.toMatch(/testimonial|\d+\s?\+?\s?(customers|companies|users)|trusted by/i);
  });
  it('shows a not-found page for unknown addresses', async () => {
    signedInBackend(); renderApp('/app/nowhere');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});

describe('login', () => {
  it('validates before calling the server', async () => {
    const b = anonymousBackend(); renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid e-mail address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(b.callsTo('POST', '/api/auth/login')).toHaveLength(0);
  });
  it('signs in and opens the dashboard', async () => {
    const b = anonymousBackend().on('POST /api/auth/login', { json: FIXTURE.user });
    b.on('GET /api/datasets', { json: FIXTURE.datasets }).on('GET /api/datasets/:id/filters', { json: FIXTURE.filters })
      .on('GET /api/datasets/:id/dashboard', { json: FIXTURE.dashboardNo }).on('GET /api/datasets/:id/analytics/products', { json: FIXTURE.products }).on('GET /api/analyses', { json: [] });
    renderApp('/app');
    await userEvent.type(await screen.findByLabelText('E-mail'), '  fx@example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'a long fixture passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Executive Dashboard' })).toBeInTheDocument();
    expect(b.callsTo('POST', '/api/auth/login')[0].body).toEqual({ email: 'fx@example.com', password: 'a long fixture passphrase' });
  });
  it('shows the server message when the password is wrong and stays on the page', async () => {
    anonymousBackend().on('POST /api/auth/login', { status: 401, json: { detail: 'Incorrect e-mail or password.' } });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever-123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect e-mail or password.');
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
  it('shows the lock-out message after too many attempts', async () => {
    anonymousBackend().on('POST /api/auth/login', { status: 429, json: { detail: 'Too many failed attempts. Please wait 15 minutes and try again.' } });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.co'); await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many failed attempts/i);
  });
  it('lets the user reveal the password', async () => {
    anonymousBackend(); renderApp('/login');
    const field = await screen.findByLabelText('Password');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
  });
});

describe('registration', () => {
  it('checks every field and does not call the server while invalid', async () => {
    const b = anonymousBackend(); renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Password'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid e-mail address.')).toBeInTheDocument();
    expect(screen.getByText(/at least 10 characters\.$/)).toBeInTheDocument();
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
    expect(b.callsTo('POST', '/api/auth/register')).toHaveLength(0);
  });
  it('creates the account and goes to the upload page', async () => {
    const b = anonymousBackend().on('POST /api/auth/register', { status: 201, json: FIXTURE.user }).on('GET /api/datasets', { json: [] }).on('GET /api/info', { json: FIXTURE.info });
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Your name'), 'Hasheka K');
    await userEvent.type(screen.getByLabelText('E-mail'), 'h@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a long passphrase');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'a long passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Data & Upload' })).toBeInTheDocument();
    expect(b.callsTo('POST', '/api/auth/register')[0].body).toEqual({ display_name: 'Hasheka K', email: 'h@example.com', password: 'a long passphrase' });
  });
  it('shows server-side complaints such as a taken e-mail', async () => {
    anonymousBackend().on('POST /api/auth/register', { status: 409, json: { detail: 'An account with this e-mail already exists.' } });
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Your name'), 'A'); await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'a long passphrase'); await userEvent.type(screen.getByLabelText('Confirm password'), 'a long passphrase');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});

describe('signing out and expiring sessions', () => {
  it('signs out from the user menu, forgets the chosen dataset and returns to the landing page', async () => {
    const b = signedInBackend().on('POST /api/auth/logout', { status: 204 });
    localStorage.setItem('complainiq.dataset', DATASET_ID);
    renderApp('/app');
    await userEvent.click(await screen.findByRole('button', { name: 'Account menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(await screen.findByRole('heading', { name: /what your customers keep complaining about/i })).toBeInTheDocument();
    expect(b.callsTo('POST', '/api/auth/logout')).toHaveLength(1);
    expect(localStorage.getItem('complainiq.dataset')).toBeNull();
  });
  it('shows the sign-in page when the server says the session has ended', async () => {
    signedInBackend().on('GET /api/datasets', { status: 401, json: { detail: 'Your session has expired. Please sign in again.' } });
    renderApp('/app');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });
  it('keeps the user menu closed until asked and closes it with Escape', async () => {
    signedInBackend(); renderApp('/app');
    const button = await screen.findByRole('button', { name: 'Account menu' });
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(button); expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});
