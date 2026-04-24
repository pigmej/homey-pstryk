"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");

function loadDeviceClass() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "homey") {
      return {
        Device: class {
          log() {}
          error() {}
          getSetting() { return false; }
        },
      };
    }

    return originalLoad.apply(this, [request, parent, isMain]);
  };

  try {
    delete require.cache[require.resolve("../drivers/pstryk_price/device")];
    return require("../drivers/pstryk_price/device");
  } finally {
    Module._load = originalLoad;
  }
}

function createDevice() {
  const Device = loadDeviceClass();
  const device = new Device();
  device._priceTiersCache = {};
  device.log = () => {};
  device.error = () => {};
  device.getSetting = () => false;
  return device;
}

function frame(currentHourStart, offsetHours, price) {
  const start = new Date(currentHourStart);
  start.setHours(start.getHours() + offsetHours);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    price_gross: price,
    is_cheap: false,
    is_expensive: false,
  };
}

test("tied price position uses the actual current frame instead of stale device state", () => {
  const device = createDevice();
  const currentHourStart = new Date();
  currentHourStart.setMinutes(0, 0, 0);

  const stalePreviousFrame = frame(currentHourStart, -1, -1.00);
  const actualCurrentFrame = frame(currentHourStart, 0, 0.50);
  const prices = [
    stalePreviousFrame,
    actualCurrentFrame,
    frame(currentHourStart, 1, 0.10),
    frame(currentHourStart, 2, -0.20),
    frame(currentHourStart, 24, -0.30),
  ];

  device._cachedData = { currentPrices: prices };
  device._validFrames = prices;
  device._currentFrame = stalePreviousFrame;

  const position = device.calculateTiedPricePosition(36);

  assert.equal(position, 4.0);
  assert.equal(position <= 1, false);
});

test("missing current frame is a safe non-cheapest position", () => {
  const device = createDevice();
  const currentHourStart = new Date();
  currentHourStart.setMinutes(0, 0, 0);

  device._cachedData = {
    currentPrices: [
      frame(currentHourStart, 1, -0.10),
      frame(currentHourStart, 2, -0.20),
    ],
  };

  assert.equal(device.calculateTiedPricePosition(36), 36.0);
});
