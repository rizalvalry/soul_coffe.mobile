import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';

/**
 * Minimal zod → react-hook-form resolver.
 *
 * Written in-house rather than pulling `@hookform/resolvers`: that package drags a
 * react-dom peer chain which conflicts with the exact React version Expo SDK 57 pins
 * (react-dom@19.2.8 wants react@^19.2.8; Expo pins react@19.2.3). Installing it would have
 * required --legacy-peer-deps, which buries a real version conflict in the lockfile instead of
 * resolving it. Twenty lines is a better trade than a suppressed peer error.
 *
 * Supports nested paths (`items.0.qty`) so the same resolver serves the refill form later.
 */
export function zodResolver<TFieldValues extends FieldValues>(
  schema: ZodType<unknown>,
): Resolver<TFieldValues> {
  return async (values) => {
    const result = schema.safeParse(values);

    if (result.success) {
      return { values: result.data as TFieldValues, errors: {} };
    }

    const errors: Record<string, unknown> = {};

    for (const issue of result.error.issues) {
      // Only the first error per field is surfaced — showing three messages under one input
      // is noise, not help.
      const path = issue.path.map(String).join('.');
      if (path && !(path in errors)) {
        errors[path] = { type: issue.code, message: issue.message };
      }
    }

    return { values: {}, errors: errors as FieldErrors<TFieldValues> };
  };
}
