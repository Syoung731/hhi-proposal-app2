/**
 * Public API for app event logging.
 * Import from app: logAppError, logAppLog, logSyncRun, logTaskRunStart, logTaskRunFinish, logRouteHealth, logTaskStatus, updateSyncRunStatus.
 */

export {
  logAppError,
  logAppLog,
  logSyncRun,
  updateSyncRunStatus,
  logTaskRunStart,
  logTaskRunFinish,
  logRouteHealth,
  logTaskStatus,
} from "./app-events";
export type { ErrorMeta, LogMeta } from "./app-events";
