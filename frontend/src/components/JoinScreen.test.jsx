import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import JoinScreen from './JoinScreen.jsx';

describe('JoinScreen', () => {
  it('validates guest names and submits a normalized room', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<JoinScreen onJoin={onJoin} />);
    await user.type(screen.getByLabelText('Your name'), 'A');
    await user.click(screen.getByRole('button', { name: 'Join the conversation' }));
    expect(screen.getByRole('alert').textContent).toContain('between 2 and 30');

    await user.clear(screen.getByLabelText('Your name'));
    await user.type(screen.getByLabelText('Your name'), '  Alex Morgan  ');
    await user.click(screen.getByRole('button', { name: 'Create or join' }));
    await user.type(screen.getByLabelText('Room'), '  design-team  ');
    await user.click(screen.getByRole('button', { name: 'Join the conversation' }));
    expect(onJoin).toHaveBeenCalledWith({ displayName: 'Alex Morgan', roomId: 'design-team' });
  });

  it('keeps the room choices within the supported room set', () => {
    render(<JoinScreen rooms={['general', 'support']} onJoin={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'general' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'support' })).toBeTruthy();
  });
});