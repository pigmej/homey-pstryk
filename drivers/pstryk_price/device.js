"use strict";

const Homey = require("homey");
const https = require("https");

module.exports = class PstrykPriceDevice extends Homey.Device {
  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log("PstrykPriceDevice has been initialized");
    this.settings = await this.getSettings();

    await this.addCapability("meter_price");

    // await this.updatePrices();
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log("PstrykPriceDevice has been added");
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log("New settings", newSettings);
    this.settings = newSettings;
    if (changedKeys.includes("apiKey")) {
      this.log("API key changed, updating prices");
      this.updatePrices();
    }
    return Promise.resolve();
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log("PstrykPriceDevice was renamed");
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log("PstrykPriceDevice has been deleted");
  }

  async apiRequest(endpoint, params, apiKey) {
    const url = new URL(`https://api.pstryk.pl${endpoint}`);
    Object.keys(params).forEach((key) =>
      url.searchParams.append(key, params[key]),
    );

    const options = {
      method: "GET",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const jsonData = JSON.parse(data);
            this.log(options);
            this.log(jsonData);
            resolve(jsonData);
          } catch (error) {
            reject(new Error("Failed to parse response data"));
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.end();
    });
  }

  async updatePrices() {
    try {
      this.log(this.settings);
      var apiKey = this.settings["apiKey"];
      if (!apiKey) {
        this.log("API key not set in device");
        return;
      }

      // Get prices for next 24 hours and cheapest times
      const { currentPrice, cheapestHours } =
        await this.getCurrentPrice(apiKey);

      await this.setCapabilityValue("meter_price", currentPrice);

      // Set cheapest hours with fallbacks
      [0, 1, 2].forEach((index) => {
        const value = cheapestHours[index] || this.homey.__("errors.na");
        this.setCapabilityValue(`cheapest_h${index}`, value);
      });

      // Get historical prices (last 7 days)
      const historicalData = await this.getHistoricalPrices(apiKey);
      this.log("Historical data updated");
    } catch (error) {
      this.error("Error updating prices:", error);
    }
  }

  async getCurrentPrice(apiKey) {
    const now = new Date();
    const windowStart = new Date();
    windowStart.setUTCHours(0, 0, 0, 0); // Start of current day in UTC

    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowStart.getDate() + 1); // Add 24 hours

    const response = await this.apiRequest(
      "/integrations/pricing/",
      {
        resolution: "hour",
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
      },
      apiKey,
    );

    const currentFrame = response.frames.find((frame) => frame.is_live);
    const futureFrames = response.frames.filter(
      (frame) =>
        new Date(frame.start) > now && new Date(frame.start) <= windowEnd,
    );

    // Get cheapest hours sorted by price
    const cheapestFrames = [...futureFrames]
      .sort((a, b) => a.price_gross - b.price_gross)
      .slice(0, 3);

    // Format to local time (HH:mm)
    const cheapestHours = cheapestFrames.map((frame) => {
      return new Date(frame.start).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    });

    return {
      currentPrice: currentFrame?.price_gross || 0,
      cheapestHours,
    };
  }

  async getHistoricalPrices(apiKey) {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - 7);

    const response = await this.apiRequest(
      "/integrations/pricing/",
      {
        resolution: "day",
        window_start: windowStart.toISOString(),
        window_end: now.toISOString(),
      },
      apiKey,
    );

    return response.frames.map((frame) => ({
      timestamp: new Date(frame.start).getTime(),
      price: frame.price_gross_avg,
    }));
  }
};
