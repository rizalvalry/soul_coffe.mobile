import { z } from 'zod';

/**
 * Indonesian mobile numbers. Accepts the three forms field staff actually type:
 *   08xxxxxxxxx   ·   628xxxxxxxxx   ·   +628xxxxxxxxx
 * Normalised to E.164 (+62…) before it reaches the API, so the server stores exactly one shape.
 */
const ID_PHONE = /^(?:\+?62|0)8[1-9][0-9]{6,11}$/;

export function normalisePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+62')) return digits;
  if (digits.startsWith('62')) return `+${digits}`;
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  return digits;
}

export const loginSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, 'Nomor HP wajib diisi')
    .refine((v) => ID_PHONE.test(v.replace(/[\s-]/g, '')), 'Format nomor HP tidak valid'),
  password: z.string().min(1, 'Kata sandi wajib diisi').min(6, 'Kata sandi minimal 6 karakter'),
});

export type LoginForm = z.infer<typeof loginSchema>;
