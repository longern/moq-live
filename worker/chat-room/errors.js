import { DURABLE_OBJECT_FREE_TIER_WRITE_LIMIT_MESSAGE } from "./constants.js";

export function isDurableObjectWriteLimitError(error) {
  return (
    error instanceof Error ? error.message : String(error ?? "")
  ).includes(DURABLE_OBJECT_FREE_TIER_WRITE_LIMIT_MESSAGE);
}
