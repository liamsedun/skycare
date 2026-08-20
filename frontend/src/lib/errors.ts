// Single import point for the SkyCare ApiError family.
// Re-exports the canonical classes from api-utils (zero behavior change — the
// withAuth/withStaff error mapping already handles them) and the shared
// body-validation helper used by the zod schema layer.
export {
  ApiError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/api-utils";
export type { ApiHandler, AuthedContext } from "@/lib/api-utils";