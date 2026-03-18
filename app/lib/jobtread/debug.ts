/**
 * Shared JobTread debug helpers.
 *
 * DEBUG_JOBTREAD_SYNC controls verbose diagnostics for the JobTread
 * pricing/sync pipeline. It is enabled only when the environment
 * variable is set to "1" or "true" (case-sensitive), and disabled
 * for all other values.
 */
export const DEBUG_JOBTREAD_SYNC =
  process.env.DEBUG_JOBTREAD_SYNC === "1" ||
  process.env.DEBUG_JOBTREAD_SYNC === "true";

