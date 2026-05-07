import { equal } from "node:assert/strict";
import {
  FREE_PLAN_DATABASE_LIMIT_BYTES,
  estimateFreePlanCapacity,
  getUsageLevel,
} from "../scripts/lib/supabase-usage-estimator.mjs";

equal(FREE_PLAN_DATABASE_LIMIT_BYTES, 500 * 1024 * 1024);

const estimate = estimateFreePlanCapacity({
  databaseSizeBytes: 11 * 1024 * 1024,
  averageGenerationLogBytes: 1250,
  dailyGenerationTarget: 1000,
  retentionDays: 7,
});

equal(estimate.estimatedRowsWithinRetention, 7000);
equal(estimate.estimatedGenerationLogBytes, 8_750_000);
equal(estimate.estimatedDatabaseBytes < FREE_PLAN_DATABASE_LIMIT_BYTES, true);
equal(getUsageLevel(estimate.estimatedDatabaseBytes, FREE_PLAN_DATABASE_LIMIT_BYTES), "safe");

const warning = getUsageLevel(380 * 1024 * 1024, FREE_PLAN_DATABASE_LIMIT_BYTES);
const danger = getUsageLevel(460 * 1024 * 1024, FREE_PLAN_DATABASE_LIMIT_BYTES);

equal(warning, "warning");
equal(danger, "danger");
