"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  UNIFIED_PRICING_ENDPOINT,
  buildUnifiedPricingQuery,
  normalizeUnifiedPricingResponse,
  calculateDailyAverage,
} = require("../drivers/pstryk_price/pricing-api");

test("buildUnifiedPricingQuery targets the unified pricing metric", () => {
  const windowStart = new Date("2026-03-25T00:00:00Z");
  const windowEnd = new Date("2026-03-27T00:00:00Z");

  assert.equal(UNIFIED_PRICING_ENDPOINT, "/integrations/meter-data/unified-metrics/");
  assert.deepEqual(buildUnifiedPricingQuery(windowStart, windowEnd), {
    metrics: "pricing",
    resolution: "hour",
    window_start: "2026-03-25T00:00:00.000Z",
    window_end: "2026-03-27T00:00:00.000Z",
  });
});

test("normalizeUnifiedPricingResponse flattens nested pricing frames", () => {
  const frames = normalizeUnifiedPricingResponse({
    frames: [
      {
        start: "2026-03-25T00:00:00Z",
        end: "2026-03-25T01:00:00Z",
        metrics: {
          pricing: {
            price_net: 1.1,
            price_gross: 1.33,
            tge_price: 1.1,
            dist_price: 0.1,
            is_cheap: true,
            is_expensive: false,
          },
        },
      },
      {
        start: "2026-03-25T01:00:00Z",
        end: "2026-03-25T02:00:00Z",
        is_live: true,
        metrics: {
          pricing: {
            price_net: 1.2,
            price_gross: 1.5,
            full_price: 1.5,
            is_cheap: false,
            is_expensive: true,
          },
        },
      },
      {
        start: "2026-03-25T02:00:00Z",
        end: "2026-03-25T03:00:00Z",
        metrics: {},
      },
      {
        start: "2026-03-25T03:00:00Z",
        end: "2026-03-25T04:00:00Z",
        metrics: {
          pricing: {
            price_gross: 1.7,
            is_cheap: null,
            is_expensive: false,
          },
        },
      },
    ],
  });

  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0], {
    start: "2026-03-25T00:00:00Z",
    end: "2026-03-25T01:00:00Z",
    is_live: false,
    tge_price: 1.1,
    dist_price: 0.1,
    service_price: undefined,
    base_price: undefined,
    vat_component: undefined,
    excise_component: undefined,
    full_price: undefined,
    price_net: 1.1,
    price_gross: 1.33,
    price_prosumer_net: undefined,
    price_prosumer_gross: undefined,
    is_cheap: true,
    is_expensive: false,
  });
  assert.equal(frames[1].is_live, true);
  assert.equal(frames[1].full_price, 1.5);
});

test("normalizeUnifiedPricingResponse rejects responses without usable pricing frames", () => {
  assert.throws(() => {
    normalizeUnifiedPricingResponse({
      frames: [
        {
          start: "2026-03-25T00:00:00Z",
          end: "2026-03-25T01:00:00Z",
          metrics: {},
        },
      ],
    });
  }, /no usable pricing frames/i);
});

test("calculateDailyAverage respects the provided timezone day boundary", () => {
  const average = calculateDailyAverage(
    [
      {
        start: "2026-03-25T22:00:00Z",
        price_gross: 10,
      },
      {
        start: "2026-03-25T23:00:00Z",
        price_gross: 20,
      },
      {
        start: "2026-03-26T00:00:00Z",
        price_gross: 40,
      },
    ],
    {
      now: new Date("2026-03-26T12:00:00Z"),
      timeZone: "Europe/Warsaw",
    },
  );

  assert.equal(average, 30);
});
