const DEFAULT_AUDIENCE_COUNT_LOCALE = "zh";

function formatCompactUnit(value) {
  const nextValue = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return String(nextValue).replace(/\.0$/, "");
}

export function formatAudienceCount(count, locale = DEFAULT_AUDIENCE_COUNT_LOCALE) {
  const nextCount = Math.max(0, Math.floor(Number(count) || 0));

  if (locale === "en") {
    if (nextCount >= 1_000_000) {
      return `${formatCompactUnit(nextCount / 1_000_000)}M`;
    }
    if (nextCount >= 1_000) {
      return `${formatCompactUnit(nextCount / 1_000)}K`;
    }
    return String(nextCount);
  }

  if (nextCount >= 100_000_000) {
    return `${formatCompactUnit(nextCount / 100_000_000)}亿`;
  }
  if (nextCount >= 10_000) {
    return `${formatCompactUnit(nextCount / 10_000)}万`;
  }
  return String(nextCount);
}
