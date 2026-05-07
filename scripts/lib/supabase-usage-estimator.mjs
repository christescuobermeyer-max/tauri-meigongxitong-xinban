export const FREE_PLAN_DATABASE_LIMIT_BYTES = 500 * 1024 * 1024;

export function estimateFreePlanCapacity({
  databaseSizeBytes,
  averageGenerationLogBytes,
  dailyGenerationTarget,
  retentionDays,
}) {
  const estimatedRowsWithinRetention = dailyGenerationTarget * retentionDays;
  const estimatedGenerationLogBytes = estimatedRowsWithinRetention * averageGenerationLogBytes;
  const estimatedDatabaseBytes = databaseSizeBytes + estimatedGenerationLogBytes;

  return {
    estimatedRowsWithinRetention,
    estimatedGenerationLogBytes,
    estimatedDatabaseBytes,
    usageRatio: estimatedDatabaseBytes / FREE_PLAN_DATABASE_LIMIT_BYTES,
  };
}

export function getUsageLevel(valueBytes, limitBytes = FREE_PLAN_DATABASE_LIMIT_BYTES) {
  const ratio = valueBytes / limitBytes;
  if (ratio >= 0.9) return "danger";
  if (ratio >= 0.7) return "warning";
  return "safe";
}

export function formatBytes(value) {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(2)} KB`;
  return `${value} B`;
}
