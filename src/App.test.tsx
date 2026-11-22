import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('CleanSheet workflow', () => {
  it('detects issues in the demo file and previews changes', async () => {
    window.location.hash = '/clean';
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(/20 rows × 6 columns → 16 rows/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Removed rows \(4\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Removed rows/ }));
    expect(screen.getAllByText(/Duplicate of row/).length).toBe(2);
  });

  it('changes options and updates the result', async () => {
    window.location.hash = '/clean';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByLabelText('Match on key columns'));
    expect(screen.getByText(/Pick at least one key column/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('email'));
    await user.selectOptions(screen.getByLabelText('Letter case for email'), 'lower');
    // margaret / MARGARET now match on email
    expect(screen.getByText(/→ 15 rows/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Drop column signup_date'));
    expect(screen.getByText(/15 rows × 5 columns after cleaning/)).toBeInTheDocument();
  });

  it('downloads the cleaned file with a success message', async () => {
    window.location.hash = '/clean';
    const user = userEvent.setup();
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Download demo-customers-clean.csv/ }));
    expect(screen.getByText(/Your original file is unchanged/)).toBeInTheDocument();
  });

  it('loads an uploaded file and handles the empty state', async () => {
    window.location.hash = '/clean';
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(document.getElementById('csv-file')!, { target: { files: [new File(['a,b\n x ,1\n x ,1'], 'mine.csv')] } });
    await waitFor(() => expect(screen.getByText(/Loaded mine.csv/)).toBeInTheDocument());
    expect(screen.getByText(/2 rows × 2 columns → 1 rows/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Load a CSV to start')).toBeInTheDocument();
  });
});
