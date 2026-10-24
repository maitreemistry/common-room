import { describe, expect, it } from 'vitest';
import {
  createMessageContentSchema,
  createMessageSendSchema,
  displayNameSchema,
  roomNameSchema
} from '../src/validation/schemas.js';

describe('request validation', () => {
  it('trims and validates guest names', () => {
    expect(displayNameSchema.parse('  Maitree  ')).toBe('Maitree');
    expect(displayNameSchema.safeParse('A').success).toBe(false);
    expect(displayNameSchema.safeParse('ab\ncd').success).toBe(false);
  });

  it('normalizes room names and rejects control characters', () => {
    expect(roomNameSchema.parse('  General  ')).toBe('general');
    expect(roomNameSchema.safeParse('bad\u0000room').success).toBe(false);
    expect(roomNameSchema.safeParse('x'.repeat(41)).success).toBe(false);
  });

  it('normalizes line endings and enforces message limits', () => {
    const schema = createMessageContentSchema(8);
    expect(schema.parse('  hi\r\nthere  ')).toBe('hi\nthere');
    expect(schema.safeParse('x'.repeat(9)).success).toBe(false);
    expect(schema.safeParse(' \n ').success).toBe(false);
  });

  it('requires UUID client IDs and strict event fields', () => {
    const schema = createMessageSendSchema(20);
    expect(schema.safeParse({ roomId: 'general', content: 'hello', clientMessageId: 'd9428888-122b-4c6a-8e33-9c5a7b4f2f3a' }).success).toBe(true);
    expect(schema.safeParse({ roomId: 'general', content: 'hello', clientMessageId: 'bad', senderId: 'spoofed' }).success).toBe(false);
  });
});