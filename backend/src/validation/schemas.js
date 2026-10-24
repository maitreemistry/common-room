import { z } from 'zod';

const containsControlCharacters = (value) => /[\u0000-\u001f\u007f]/u.test(value);

export const displayNameSchema = z.string()
  .trim()
  .min(2, 'Display name must be at least 2 characters.')
  .max(30, 'Display name must be at most 30 characters.')
  .refine((value) => !containsControlCharacters(value), 'Display name contains invalid characters.');

export const roomNameSchema = z.string()
  .trim()
  .min(1, 'Room name is required.')
  .max(40, 'Room name must be at most 40 characters.')
  .refine((value) => !containsControlCharacters(value), 'Room name contains invalid characters.')
  .transform((value) => value.toLowerCase());

export function createMessageContentSchema(maxLength = 2000) {
  return z.string()
    .transform((value) => value.replace(/\r\n?/gu, '\n').trim())
    .pipe(z.string()
      .min(1, 'Message cannot be empty.')
      .max(maxLength, `Message must be at most ${maxLength} characters.`)
      .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value), 'Message contains invalid characters.'));
}

export const guestSessionRequestSchema = z.object({
  displayName: displayNameSchema
}).strict();

export const roomJoinSchema = z.object({
  roomId: roomNameSchema
}).strict();

export function createMessageSendSchema(maxLength = 2000) {
  return z.object({
    roomId: roomNameSchema,
    content: createMessageContentSchema(maxLength),
    clientMessageId: z.string().uuid()
  }).strict();
}

export const messageHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).strict();