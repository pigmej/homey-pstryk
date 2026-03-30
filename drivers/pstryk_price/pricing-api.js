"use strict";

const UNIFIED_PRICING_ENDPOINT = "/integrations/meter-data/unified-metrics/";
const PRICING_METRIC = "pricing";

function buildUnifiedPricingQuery(windowStart, windowEnd) {
  return {
    metrics: PRICING_METRIC,
    resolution: "hour",
    window_start: toIsoString(windowStart, "windowStart"),
    window_end: toIsoString(windowEnd, "windowEnd"),
  };
}

function toIsoString(value, label) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Expected ${label} to be a valid Date`);
  }

  return value.toISOString();
}

function normalizeUnifiedPricingResponse(response) {
  if (!response || !Array.isArray(response.frames)) {
    throw new Error("Unified pricing response is missing frames array");
  }

  const frames = response.frames
    .map(normalizePricingFrame)
    .filter(isUsablePricingFrame);

  if (frames.length === 0) {
    throw new Error("Unified pricing response contains no usable pricing frames");
  }

  return frames;
}

function normalizePricingFrame(frame) {
  const pricing = frame?.metrics?.pricing;
  if (!pricing || typeof frame.start !== "string" || typeof frame.end !== "string") {
    return null;
  }

  return {
    start: frame.start,
    end: frame.end,
    is_live: frame.is_live === true,
    tge_price: pricing.tge_price,
    dist_price: pricing.dist_price,
    service_price: pricing.service_price,
    base_price: pricing.base_price,
    vat_component: pricing.vat_component,
    excise_component: pricing.excise_component,
    full_price: pricing.full_price,
    price_net: pricing.price_net,
    price_gross: pricing.price_gross,
    price_prosumer_net: pricing.price_prosumer_net,
    price_prosumer_gross: pricing.price_prosumer_gross,
    is_cheap: pricing.is_cheap,
    is_expensive: pricing.is_expensive,
  };
}

function isUsablePricingFrame(frame) {
  return Boolean(
    frame
      && Number.isFinite(frame.price_gross)
      && typeof frame.is_cheap === "boolean"
      && typeof frame.is_expensive === "boolean",
  );
}

function calculateDailyAverage(frames, options = {}) {
  const { now = new Date(), timeZone } = options;
  if (!Array.isArray(frames) || frames.length === 0) {
    return 0;
  }

  const today = formatCalendarDate(now, timeZone);
  const todayFrames = frames.filter((frame) => {
    return Number.isFinite(frame.price_gross)
      && formatCalendarDate(frame.start, timeZone) === today;
  });

  if (todayFrames.length === 0) {
    return 0;
  }

  const total = todayFrames.reduce((sum, frame) => sum + frame.price_gross, 0);
  return total / todayFrames.length;
}

function formatCalendarDate(value, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(value));
}

module.exports = {
  UNIFIED_PRICING_ENDPOINT,
  buildUnifiedPricingQuery,
  normalizeUnifiedPricingResponse,
  calculateDailyAverage,
};
