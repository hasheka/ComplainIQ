import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE, signedInBackend } from '@/test/fakeBackend';
import { renderApp } from '@/test/render';
import predictOk from '@/test/fixtures/predict_ok.json';
import predictInsufficient from '@/test/fixtures/predict_insufficient.json';

afterEach(() => vi.unstubAllGlobals());
const box = () => screen.findByLabelText('Complaint description');
const predictButton = () => screen.findByRole('button', { name: 'Predict' });

describe('prediction page', () => {
  it('is honest about what the model can and cannot do', async () => {
    signedInBackend(); renderApp('/app/prediction');
    expect(await screen.findByText(/product category/i, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/does not predict the issue or the sentiment/i)).toBeInTheDocument();
    expect(screen.queryByText(/predicted issue/i)).toBeNull();
  });
  it('shows the held-out accuracy and the weak spots from the model card', async () => {
    signedInBackend(); renderApp('/app/prediction');
    expect(await screen.findByText('85.02%')).toBeInTheDocument();
    expect(screen.getByText(/never seen/i)).toBeInTheDocument();
    expect(screen.getByText(/Less reliable for:/)).toHaveTextContent('Virtual currency');
  });
  it('requires enough text before calling the server', async () => {
    const b = signedInBackend().on('POST /api/predict', { json: predictOk }); renderApp('/app/prediction');
    await userEvent.click(await predictButton());
    expect(await screen.findByText('Enter a complaint description to classify.')).toBeInTheDocument();
    await userEvent.type(await box(), 'too short');
    await userEvent.click(await predictButton());
    expect(await screen.findByText('Please enter at least 10 characters.')).toBeInTheDocument();
    expect(b.callsTo('POST', '/api/predict')).toHaveLength(0);
  });
  it('sends the trimmed text and shows the predicted product with confidence and runners-up', async () => {
    const b = signedInBackend().on('POST /api/predict', { json: predictOk }); renderApp('/app/prediction');
    await userEvent.type(await box(), '  A debt collector keeps calling me about a debt that is not mine  ');
    await userEvent.click(await predictButton());
    expect(await screen.findByText('Predicted product')).toBeInTheDocument();
    expect(b.callsTo('POST', '/api/predict')[0].body).toEqual({ text: 'A debt collector keeps calling me about a debt that is not mine' });
    expect(screen.getAllByText('Debt collection').length).toBeGreaterThan(0);
    expect(screen.getByText('Other likely products')).toBeInTheDocument();
    expect(screen.getByText(/not calibrated/i)).toBeInTheDocument();
    expect(screen.getByText(/confidence$/i, { selector: 'span' })).toBeInTheDocument();
  });
  it('says no prediction was made, rather than guessing, when no words are recognised', async () => {
    signedInBackend().on('POST /api/predict', { json: predictInsufficient }); renderApp('/app/prediction');
    await userEvent.type(await box(), 'zzzz qqqq 12345 !!!!');
    await userEvent.click(await predictButton());
    expect(await screen.findByText('No prediction made')).toBeInTheDocument();
    expect(screen.queryByText('Predicted product')).toBeNull();
  });
  it('shows a plain message when the model is unavailable', async () => {
    signedInBackend().on('POST /api/predict', { status: 503, json: { detail: 'The prediction model is not available on the server right now.' } }).on('GET /api/model', { status: 503, json: { detail: 'x' } });
    renderApp('/app/prediction');
    await userEvent.type(await box(), 'My mortgage escrow payment was lost');
    await userEvent.click(await predictButton());
    expect(await screen.findByText('The prediction model is not available on the server right now.')).toBeInTheDocument();
    expect(screen.getByText(/Model details are not available right now/)).toBeInTheDocument();
  });
  it('fills the box from the examples and counts characters', async () => {
    signedInBackend(); renderApp('/app/prediction');
    await userEvent.click(await screen.findByRole('button', { name: 'Load example 1' }));
    expect((await box() as HTMLTextAreaElement).value).toMatch(/debt collector/);
    expect(screen.getByText(/\/ 10,000/)).toBeInTheDocument();
  });
  it('does not require a dataset to be uploaded first', async () => {
    signedInBackend().on('GET /api/datasets', { json: [] }); renderApp('/app/prediction');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'AI Complaint Prediction' })).toBeInTheDocument());
    expect(screen.queryByText('No data yet')).toBeNull();
  });
});

describe('model info source', () => {
  it('uses the real model card fixture', () => expect(FIXTURE.model.evaluation.accuracy).toBeCloseTo(0.8502, 4));
});
