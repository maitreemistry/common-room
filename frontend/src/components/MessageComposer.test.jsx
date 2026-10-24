import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MessageComposer from './MessageComposer.jsx';

describe('MessageComposer', () => {
  it('sends on Enter and preserves Shift+Enter as a newline', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue({});
    render(<MessageComposer onSend={onSend} connection="connected" />);
    const input = screen.getByLabelText('Write a message');
    await user.type(input, 'first line');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    await user.type(input, 'second line');
    expect(input.value).toBe('first line\nsecond line');
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('first line\nsecond line', expect.any(String));
    expect(await screen.findByText('Message sent and stored.')).toBeTruthy();
  });

  it('keeps an unconfirmed message and retries it with the same idempotency key', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn()
      .mockRejectedValueOnce(new Error('Acknowledgement timed out.'))
      .mockResolvedValueOnce({});
    render(<MessageComposer onSend={onSend} connection="connected" />);
    const input = screen.getByLabelText('Write a message');
    await user.type(input, 'Please keep this');
    await user.keyboard('{Enter}');
    await screen.findByText('Acknowledgement timed out.');
    const clientMessageId = onSend.mock.calls[0][1];
    await user.click(screen.getByRole('button', { name: 'Retry same message' }));
    expect(onSend).toHaveBeenNthCalledWith(2, 'Please keep this', clientMessageId);
    expect(await screen.findByText('Message sent and stored.')).toBeTruthy();
  });
});