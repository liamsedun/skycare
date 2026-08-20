import { z } from "zod";
import { ValidationError } from "@/lib/errors";

export { z };

/**
 * Parse an unknown payload against a zod schema and throw the API layer's
 * ValidationError (400) on the first issue — never a bare ZodError, which
 * withAuth would otherwise map to a 500.
 */
export function validateWith<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(issue?.message ?? "Invalid request body");
  }
  return result.data;
}