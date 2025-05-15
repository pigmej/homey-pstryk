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
    
    // Initialize daily average cache
    this._dailyAverageCache = {
      value: null,
      expires: null, // Timestamp when cache expires
      date: null, // Date string for which average is valid
    };

    await this.addCapability("current_hour_price");
    await this.addCapability("current_hour_value");
    await this.addCapability("currently_cheap");
    await this.addCapability("currently_expensive");
    await this.addCapability("cheapest_h0");
    await this.addCapability("cheapest_h1");
    await this.addCapability("cheapest_h2");
    await this.addCapability("cheapest_h0_value");
    await this.addCapability("cheapest_h1_value");
    await this.addCapability("cheapest_h2_value");
    await this.addCapability("maximise_usage_during");
    await this.addCapability("minimise_usage_during");
    await this.addCapability("maximise_usage_now");
    await this.addCapability("minimise_usage_now");
    await this.addCapability("daily_average_price");
    await this.addCapability("current_hour_in_cheapest");
    await this.addCapability("current_hour_in_cheapest_4h");
    await this.addCapability("current_hour_in_cheapest_12h");
    await this.addCapability("current_hour_in_cheapest_24h");
    await this.addCapability("current_hour_in_cheapest_36h");

    this._hasRefreshedToday = false;
    this._previousBlocks = null;

    // Add periodic check for current usage period (reduced frequency)
    this._currentCheckInterval = this.homey.setInterval(
      () => {
        this.checkCurrentUsagePeriod();
      },
      5 * 60 * 1000,
    ); // Check every 5 minutes

    // Setup daily price refresh
    this.setupPriceRefresh();

    // Initial update
    setTimeout(() => this.updatePrices(), 2000);
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

    if (changedKeys.includes("priceRefreshHour")) {
      this.log("Price refresh hour changed, updating refresh schedule");
      // Clear existing interval and set up a new one
      if (this._priceRefreshInterval) {
        clearInterval(this._priceRefreshInterval);
      }
      // Clear daily average cache
      this._dailyAverageCache = { value: null, expires: null, date: null };
      this.setupPriceRefresh();
    }

    if (
      changedKeys.includes("todayLabel") ||
      changedKeys.includes("tomorrowLabel") ||
      changedKeys.includes("priceDiffThreshold")
    ) {
      if (changedKeys.includes("priceDiffThreshold")) {
        this.log(
          "Price difference threshold changed to",
          newSettings.priceDiffThreshold + "%",
        );
      } else {
        this.log("Date labels changed, updating periods");
      }
      this.updatePrices(); // Refresh displayed periods with new settings
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

    // Clear the price refresh interval
    if (this._priceRefreshInterval) {
      clearInterval(this._priceRefreshInterval);
    }

    // Clear the current check interval
    if (this._currentCheckInterval) {
      this.homey.clearInterval(this._currentCheckInterval);
    }

    // Clear the smart scheduling timeouts
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }

    if (this._hourlyTimeout) {
      clearTimeout(this._hourlyTimeout);
    }
  }

  /**
   * Check if current time is within a maximise or minimise usage period
   */
  checkCurrentUsagePeriod() {
    // Use existing data if recent (30 seconds)
    if (this._lastUsageCheck && Date.now() - this._lastUsageCheck < 30000) {
      return;
    }

    const now = new Date();
    let isMaximise = false;
    let isMinimise = false;

    if (this._previousBlocks) {
      // Check maximise periods with inclusive end time
      isMaximise = this._previousBlocks.cheapBlocks.some((block) => {
        const blockStart =
          block.startTime instanceof Date
            ? block.startTime
            : new Date(block.startTime);
        const blockEnd =
          block.endTime instanceof Date
            ? block.endTime
            : new Date(block.endTime);
        return now >= blockStart && now <= blockEnd; // Changed to <= to include end time
      });

      // Check minimise periods with inclusive end time
      isMinimise = this._previousBlocks.expensiveBlocks.some((block) => {
        const blockStart =
          block.startTime instanceof Date
            ? block.startTime
            : new Date(block.startTime);
        const blockEnd =
          block.endTime instanceof Date
            ? block.endTime
            : new Date(block.endTime);
        return now >= blockStart && now <= blockEnd; // Changed to <= to include end time
      });
    }

    // Only update capabilities if values have changed
    const currentMaximise = this.getCapabilityValue("maximise_usage_now");
    const currentMinimise = this.getCapabilityValue("minimise_usage_now");

    if (currentMaximise !== isMaximise) {
      this.setCapabilityValue("maximise_usage_now", isMaximise).catch((err) =>
        this.error("Error setting maximise_usage_now:", err),
      );
    }

    if (currentMinimise !== isMinimise) {
      this.setCapabilityValue("minimise_usage_now", isMinimise).catch((err) =>
        this.error("Error setting minimise_usage_now:", err),
      );
    }

    // Track last check time
    this._lastUsageCheck = Date.now();

    if (currentMaximise !== isMaximise || currentMinimise !== isMinimise) {
      this.log(
        `Usage period changed: Maximise=${isMaximise}, Minimise=${isMinimise}`,
      );
    }
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

    // this.log("Params", url);

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

  /**
   * Set up the daily price refresh with smart scheduling
   */
  async setupPriceRefresh() {
    const refreshHour = this.settings.priceRefreshHour || 15;

    this.log(`Setting up daily price refresh at hour ${refreshHour}`);

    const scheduleNextRefresh = () => {
      const now = new Date();
      let nextRefresh = new Date(now);

      // Set to next refresh hour with 5-minute window
      if (now.getHours() >= refreshHour) {
        nextRefresh.setDate(now.getDate() + 1);
      }
      nextRefresh.setHours(refreshHour, 0, 0, 0);

      const timeUntilRefresh = nextRefresh - now;

      this._refreshTimeout = setTimeout(async () => {
        try {
          this.log("Daily price refresh triggered");
          await this.updatePrices();
          this._hasRefreshedToday = true;
        } catch (error) {
          this.error("Daily refresh failed, retrying in 15m", error);
          this._refreshTimeout = setTimeout(
            scheduleNextRefresh,
            15 * 60 * 1000,
          );
        }
        scheduleNextRefresh();
      }, timeUntilRefresh);

      this.log(
        `Next daily refresh scheduled in ${Math.round(timeUntilRefresh / (60 * 60 * 1000))} hours`,
      );
    };

    // Add smart hourly checker
    const setupHourlyCheck = () => {
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1);
      nextHour.setMinutes(0, 0, 0);

      const timeUntilNextHour = nextHour - now;

      this._hourlyTimeout = setTimeout(async () => {
        try {
          this.log("Scheduled hourly update");
          await this.updatePrices();
        } catch (error) {
          this.error("Hourly update failed", error);
        } finally {
          setupHourlyCheck();
        }
      }, timeUntilNextHour);

      this.log(
        `Next hourly update scheduled in ${Math.round(timeUntilNextHour / (60 * 1000))} minutes`,
      );
    };

    // Initial setup
    scheduleNextRefresh();
    setupHourlyCheck();
  }

  async updatePrices(retryCount = 0) {
    try {
      const now = new Date();
      const lastUpdate = this._lastPriceUpdate || 0;

      // Cache prices for 5 minutes unless during refresh window
      if (
        now - lastUpdate < 300000 &&
        !(
          now.getHours() === (this.settings.priceRefreshHour || 15) &&
          now.getMinutes() < 5
        )
      ) {
        this.log("Using cached price data (updated less than 5 minutes ago)");
        return;
      }

      var apiKey = this.settings["apiKey"];
      if (!apiKey) {
        this.log("API key not set in device");
        return;
      }

      this.log("Updating prices from PSTRYK API");

      // Initial check of current usage period
      if (this._previousBlocks) {
        this.checkCurrentUsagePeriod();
      }

      // Track this update time
      this._lastPriceUpdate = Date.now();

      // Get prices for next 24 hours and cheapest times
      const {
        currentPriceInfo,
        cheapestHours,
        cheapestHoursValues,
        currentHourInCheapestValue,
        currentHourInCheapest4hValue,
        currentHourInCheapest12hValue,
        currentHourInCheapest24hValue,
        currentHourInCheapest36hValue,
      } = await this.getCurrentPrice(apiKey);

      // Get daily average price
      const dailyAvgPrice = await this.getDailyAveragePrice(apiKey);
      await this.setCapabilityValue("daily_average_price", dailyAvgPrice);
      this.log("Daily average price updated:", dailyAvgPrice);

      await this.setCapabilityValue(
        "current_hour_price",
        currentPriceInfo.price,
      );
      await this.setCapabilityValue(
        "current_hour_value",
        currentPriceInfo.hour,
      );
      await this.setCapabilityValue(
        "currently_cheap",
        currentPriceInfo.is_cheap,
      );
      await this.setCapabilityValue(
        "currently_expensive",
        currentPriceInfo.is_expensive,
      );
      // Log the values to help with debugging
      this.log(`Setting current_hour_in_cheapest capabilities:`);
      this.log(`  8h window: ${currentHourInCheapestValue}`);
      this.log(`  4h window: ${currentHourInCheapest4hValue}`);
      this.log(`  12h window: ${currentHourInCheapest12hValue}`);
      this.log(`  24h window: ${currentHourInCheapest24hValue}`);
      this.log(`  36h window: ${currentHourInCheapest36hValue}`);

      // Set all the capability values
      await this.setCapabilityValue(
        "current_hour_in_cheapest",
        currentHourInCheapestValue,
      );

      await this.setCapabilityValue(
        "current_hour_in_cheapest_4h",
        currentHourInCheapest4hValue,
      );

      await this.setCapabilityValue(
        "current_hour_in_cheapest_12h",
        currentHourInCheapest12hValue,
      );

      await this.setCapabilityValue(
        "current_hour_in_cheapest_24h",
        currentHourInCheapest24hValue,
      );

      await this.setCapabilityValue(
        "current_hour_in_cheapest_36h",
        currentHourInCheapest36hValue,
      );

      this.log(currentPriceInfo, cheapestHours, cheapestHoursValues);

      // [
      //   // Set cheapest hours with fallbacks
      //   (0, 1, 2),
      // ].forEach((index) => {
      //   const hour = cheapestHours[index] || this.homey.__("errors.na");
      //   this.log(hour);
      //   this.setCapabilityValue(`cheapest_h${index}`, hour);
      //   const value = cheapestHoursValues[index] || this.homey.__("errors.na");
      //   this.log(value);
      //   this.log(index);
      //   this.setCapabilityValue(`cheapest_h${index}_value`, value);
      // });

      await this.setCapabilityValue("cheapest_h0", cheapestHours[0]);
      await this.setCapabilityValue(
        "cheapest_h0_value",
        cheapestHoursValues[0],
      );

      await this.setCapabilityValue("cheapest_h1", cheapestHours[1]);
      await this.setCapabilityValue(
        "cheapest_h1_value",
        cheapestHoursValues[1],
      );

      await this.setCapabilityValue("cheapest_h2", cheapestHours[2]);
      await this.setCapabilityValue(
        "cheapest_h2_value",
        cheapestHoursValues[2],
      );
      // Get historical prices (last 7 days)
      // const historicalData = await this.getHistoricalPrices(apiKey);
      // this.log("Historical data updated");

      // Store current hour for next check
      this.lastUpdateHour = now.getHours();
    } catch (error) {
      this.error("Error updating prices:", error);
    }
  }

  async getCurrentPrice(apiKey) {
    const now = new Date();
    const windowStart = new Date();
    if (windowStart.getUTCHours() === 0) {
      windowStart.setUTCDate(windowStart.getUTCDate() - 1);
      windowStart.setUTCHours(23, 0, 0, 0); // Set to 23:00 of the previous day
    } else {
      windowStart.setUTCHours(windowStart.getUTCHours() - 1, 0, 0, 0); // Rewind to one hour earlier than now in UTC
    }

    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowStart.getUTCDate() + 1); // Add 24 hours
    windowEnd.setUTCHours(23, 0, 0, 0);

    const response = await this.apiRequest(
      "/integrations/pricing/",
      {
        resolution: "hour",
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
      },
      apiKey,
    );

    // Filter out frames where is_cheap or is_expensive is null
    const validFrames = response.frames.filter((frame) => {
      if (frame.is_cheap === null || frame.is_expensive === null) {
        this.log("Filtered out invalid frame:", frame);
        return false;
      }
      return true;
    });

    // Get cheapest hours sorted by price from valid frames
    const validCheapestFrames = [...validFrames]
      .sort((a, b) => a.price_gross - b.price_gross)
      .slice(0, 3);

    // Update cheapest hours if valid data is available
    if (validCheapestFrames.length > 0) {
      this.log(`Found ${validCheapestFrames.length} valid cheapest frames`);
    } else {
      this.error("No valid frames found for cheapest hours");
    }

    const currentFrame = validFrames.find((frame) => frame.is_live);
    const futureFrames = validFrames.filter(
      (frame) =>
        new Date(frame.start) > now && new Date(frame.start) <= windowEnd,
    );

    // Get cheapest hours sorted by price
    const cheapestFrames = [...futureFrames]
      .sort((a, b) => a.price_gross - b.price_gross)
      .slice(0, 3);

    // Format to local time (HH:mm)
    const cheapestHours = cheapestFrames.map((frame) => {
      return new Date(frame.start)
        .toLocaleString([], {
          timeZone: this.homey.clock.getTimezone(),
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
          hourCycle: "h23",
        })
        .replace(",", "");
    });

    const cheapestHoursValues = cheapestFrames.map((frame) => {
      return frame.price_gross;
    });

    // Create a structured object for current price information
    const currentPriceInfo = {
      price: currentFrame?.price_gross || 0,
      hour:
        new Date(currentFrame?.start).toLocaleString([], {
          timeZone: this.homey.clock.getTimezone(),
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
          hourCycle: "h23",
        }) || "",
      is_cheap: currentFrame?.is_cheap || false,
      is_expensive: currentFrame?.is_expensive || false,
      frame: currentFrame || null,
    };

    // Helper function to calculate cheapest hour rank for a given window size
    const calculateCheapestHourRank = (hourWindow) => {
      let rankValue = 0;

      if (currentFrame) {
        const now = new Date();

        // Create window starting from current hour
        const windowEnd = new Date(now);
        windowEnd.setHours(now.getHours() + hourWindow);

        // Get all frames within the window (including the current hour)
        const windowFrames = validFrames.filter((frame) => {
          const frameStart = new Date(frame.start);
          // Include current hour and next hours up to window size
          return frameStart >= now && frameStart < windowEnd;
        });

        // Add current hour to window frames if not already included
        let framesWithCurrentHour = [...windowFrames];
        if (
          !framesWithCurrentHour.some(
            (frame) => frame.start === currentFrame.start,
          )
        ) {
          framesWithCurrentHour.push(currentFrame);
        }

        this.log(
          `Found ${framesWithCurrentHour.length} frames in ${hourWindow}-hour window`,
        );

        // Sort frames by price (cheapest first)
        const sortedFrames = framesWithCurrentHour.sort(
          (a, b) => a.price_gross - b.price_gross,
        );

        // Get the prices for logging
        const frameDetails = sortedFrames.map((frame) => {
          return {
            start: new Date(frame.start).toLocaleTimeString(),
            price: frame.price_gross,
            isCurrent: frame.start === currentFrame.start,
          };
        });

        this.log(
          `Frames in ${hourWindow}-hour window (sorted by price):`,
          JSON.stringify(frameDetails, null, 2),
        );

        // Find current frame's position in the sorted list
        if (sortedFrames.length > 0) {
          const currentFrameIndex = sortedFrames.findIndex(
            (frame) => frame.start === currentFrame.start,
          );

          this.log(
            `Current frame position in ${hourWindow}-hour window sorted list: ${currentFrameIndex}`,
          );

          if (currentFrameIndex === 0) {
            // Current hour is the cheapest in the window
            rankValue = 1;
          } else if (currentFrameIndex === 1) {
            // Current hour is the 2nd cheapest in the window
            rankValue = 2;
          } else if (currentFrameIndex === 2) {
            // Current hour is the 3rd cheapest in the window
            rankValue = 3;
          }
        }
      }

      return rankValue;
    };

    // Calculate rank for different time windows
    let currentHourInCheapestValue = calculateCheapestHourRank(8);
    let currentHourInCheapest4hValue = calculateCheapestHourRank(4);
    let currentHourInCheapest12hValue = calculateCheapestHourRank(12);
    let currentHourInCheapest24hValue = calculateCheapestHourRank(24);
    let currentHourInCheapest36hValue = calculateCheapestHourRank(36);

    // Find optimal 2+ hour periods for limiting and maximizing electricity usage
    const { cheapBlocks, expensiveBlocks } =
      this.findOptimalPeriods(validFrames);

    // Set capability values for optimal periods
    if (cheapBlocks.length > 0) {
      await this.setCapabilityValue(
        "maximise_usage_during",
        cheapBlocks.map((block) => block.formattedPeriod).join("\n"),
      );
    }

    if (expensiveBlocks.length > 0) {
      await this.setCapabilityValue(
        "minimise_usage_during",
        expensiveBlocks.map((block) => block.formattedPeriod).join("\n"),
      );
    }

    return {
      currentPriceInfo,
      cheapestHours,
      cheapestHoursValues,
      cheapBlocks,
      expensiveBlocks,
      currentHourInCheapestValue,
      currentHourInCheapest4hValue,
      currentHourInCheapest12hValue,
      currentHourInCheapest24hValue,
      currentHourInCheapest36hValue,
    };
  }

  /**
   * Find optimal periods for limiting and maximizing electricity usage
   * @param {Array} frames - The price frames from the API
   * @returns {Object} Object containing cheap and expensive blocks
   */
  findOptimalPeriods(frames) {
    // Consider future frames within the next 36 hours for better continuity
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(now.getHours() + 36);

    const futureFrames = frames.filter((frame) => {
      const frameStart = new Date(frame.start);
      const frameEnd = new Date(frame.end);
      return frameEnd > now && frameStart < cutoff; // Include current ongoing periods
    });

    if (futureFrames.length === 0) {
      this.log("No future frames available to find optimal periods");
      return { cheapBlocks: [], expensiveBlocks: [] };
    }

    // Function to find optimal blocks by processing frames in price order
    const findOptimalBlocks = (frames, isAscending = true) => {
      // Create a copy of frames that we can modify
      var availableFrames = [...frames];

      // Sort by price (ascending for cheap, descending for expensive)
      availableFrames.sort((a, b) => {
        return isAscending
          ? a.price_gross - b.price_gross
          : b.price_gross - a.price_gross;
      });

      const blocks = [];

      // Process frames until we have 3 blocks or run out of frames
      const processedFrames = new Set();

      while (availableFrames.length > 0 && blocks.length < 3) {
        // Take the first frame (cheapest or most expensive)
        const startFrame = availableFrames.shift();
        if (processedFrames.has(startFrame.start)) continue;

        // Start a new block with this frame
        // The API typically provides hourly data where a frame's end time is the same as
        // the next frame's start time. For example, 14:00-15:00 and 15:00-16:00.
        const frameDuration =
          new Date(startFrame.end) - new Date(startFrame.start);

        // Create a block with proper start and end times
        const block = {
          startTime: new Date(startFrame.start),
          endTime: new Date(startFrame.end),
          durationHours: Math.max(1, Math.round(frameDuration / 3600000)),
          avgPrice: startFrame.price_gross,
          frames: [startFrame],
          // Add frameInfo for debugging
          frameInfo: [
            {
              index: 0,
              start: new Date(startFrame.start).toISOString(),
              end: new Date(startFrame.end).toISOString(),
              price: startFrame.price_gross,
            },
          ],
        };

        processedFrames.add(startFrame.start);

        // Try to extend the block with consecutive hours
        let extended = true;

        // Keep extending until we can't anymore or reach 6 hours
        while (extended && block.frames.length < 6) {
          extended = false;

          const lastFrameEnd = new Date(
            block.frames[block.frames.length - 1].end,
          );

          // Look for adjacent frames in both directions
          const adjacentFrames = availableFrames.filter((frame) => {
            const frameStart = new Date(frame.start);
            return (
              frameStart.getTime() === lastFrameEnd.getTime() || // Next hour
              frameStart.getTime() === lastFrameEnd.getTime() - 3600000
            ); // Previous hour
          });

          // Find best match within price threshold
          let bestFrame = null;
          let bestTimeDiff = Infinity;

          adjacentFrames.forEach((frame) => {
            const frameTime = new Date(frame.start);
            const timeDiff = Math.abs(frameTime - lastFrameEnd);

            // Prioritize same price first, then closest time
            if (
              frame.price_gross === block.avgPrice &&
              timeDiff < bestTimeDiff
            ) {
              bestFrame = frame;
              bestTimeDiff = timeDiff;
            }
          });

          // If no exact price match found, look for nearby frames with small price difference
          if (!bestFrame) {
            // Get configurable price difference threshold (default to 10% if not set)
            const priceDiffThreshold =
              this.settings.priceDiffThreshold !== undefined
                ? this.settings.priceDiffThreshold / 100
                : 0.1;

            adjacentFrames.forEach((frame) => {
              const priceDiff = Math.abs(frame.price_gross - block.avgPrice);
              const timeDiff = Math.abs(new Date(frame.start) - lastFrameEnd);

              if (
                priceDiff <= block.avgPrice * priceDiffThreshold &&
                timeDiff < bestTimeDiff
              ) {
                bestFrame = frame;
                bestTimeDiff = timeDiff;
              }
            });
          }

          if (bestFrame) {
            const frameIndex = availableFrames.findIndex(
              (f) => f.start === bestFrame.start,
            );
            availableFrames.splice(frameIndex, 1);

            // Insert at correct position based on time
            const bestFrameTime = new Date(bestFrame.start);

            if (bestFrameTime >= lastFrameEnd) {
              // Add to end - ensuring we don't create time overlap/gaps
              block.frames.push(bestFrame);
              block.endTime = new Date(bestFrame.end);

              // Add frame info for debugging
              block.frameInfo.push({
                index: frameIndex,
                start: new Date(bestFrame.start).toISOString(),
                end: new Date(bestFrame.end).toISOString(),
                price: bestFrame.price_gross,
                position: "end",
              });
            } else {
              // Add to beginning - ensuring we don't create time overlap/gaps
              block.frames.unshift(bestFrame);
              block.startTime = new Date(bestFrame.start);

              // Add frame info for debugging
              block.frameInfo.unshift({
                index: 0, // will shift others
                start: new Date(bestFrame.start).toISOString(),
                end: new Date(bestFrame.end).toISOString(),
                price: bestFrame.price_gross,
                position: "beginning",
              });

              // Update indices for existing frame info entries
              for (let i = 1; i < block.frameInfo.length; i++) {
                block.frameInfo[i].index = i;
              }
            }

            // Recalculate average
            block.avgPrice =
              block.frames.reduce((sum, f) => sum + f.price_gross, 0) /
              block.frames.length;

            // Verify and enforce time continuity - calculate duration based on frame count
            // For hourly data, each frame should be 1 hour, so use frame count directly
            block.durationHours = block.frames.length;

            // Double-check start/end times and log any irregularities
            const startToEndDuration =
              (block.endTime - block.startTime) / 3600000;
            if (Math.abs(startToEndDuration - block.durationHours) > 0.1) {
              this.log(
                `Warning: Duration mismatch - frames: ${block.durationHours}h, time diff: ${startToEndDuration.toFixed(2)}h`,
              );
            }

            extended = true;
          }
        }

        // Add all frames in this block to processed set
        block.frames.forEach((f) => processedFrames.add(f.start));
        blocks.push(block);

        // Remove any frames that overlap with this block from available frames
        for (let i = availableFrames.length - 1; i >= 0; i--) {
          const frameStart = new Date(availableFrames[i].start);
          const frameEnd = new Date(availableFrames[i].end);

          // Check if this frame overlaps with the block
          if (
            (frameStart >= block.startTime && frameStart < block.endTime) ||
            (frameEnd > block.startTime && frameEnd <= block.endTime)
          ) {
            availableFrames.splice(i, 1);
          }
        }
      }

      return blocks;
    };

    // Get cheapest blocks
    let cheapBlocks = findOptimalBlocks(futureFrames, true);

    // Get most expensive blocks
    let expensiveBlocks = findOptimalBlocks(futureFrames, false);

    // Merge with previous blocks if they exist and are still valid
    if (this._previousBlocks) {
      // Keep only blocks that haven't ended yet
      const validCheapBlocks =
        this._previousBlocks.cheapBlocks?.filter(
          (block) => new Date(block.endTime) > now,
        ) || [];

      const validExpensiveBlocks =
        this._previousBlocks.expensiveBlocks?.filter(
          (block) => new Date(block.endTime) > now,
        ) || [];

      // Merge with new blocks
      if (validCheapBlocks.length > 0) {
        cheapBlocks = this.mergeBlocks([...validCheapBlocks, ...cheapBlocks]);
      }

      if (validExpensiveBlocks.length > 0) {
        expensiveBlocks = this.mergeBlocks([
          ...validExpensiveBlocks,
          ...expensiveBlocks,
        ]);
      }
    }

    // Format blocks for display and return
    const formatBlocks = (blocks) => {
      return blocks.map((block, index) => {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        const getDateLabel = (date) => {
          const dateStr = date.toLocaleDateString([], {
            timeZone: this.homey.clock.getTimezone(),
            day: "2-digit",
            month: "2-digit",
          });

          const todayLabel = this.getSetting("todayLabel") || "Today";
          const tomorrowLabel = this.getSetting("tomorrowLabel") || "Tomorrow";

          if (date.toDateString() === now.toDateString()) {
            return todayLabel;
          } else if (date.toDateString() === tomorrow.toDateString()) {
            return tomorrowLabel;
          }
          return dateStr;
        };

        // Format start time
        const startDateLabel = getDateLabel(block.startTime);
        const startTime = block.startTime
          .toLocaleTimeString([], {
            timeZone: this.homey.clock.getTimezone(),
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          })
          .replace("24:", "00:");

        // For hourly data, API typically sets endTime to the start of the next hour
        // We need to ensure end time displays correctly without appearing before start time

        // Create a proper formatter for times with hour display
        const timeFormatter = new Intl.DateTimeFormat([], {
          timeZone: this.homey.clock.getTimezone(),
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        });

        // For display purposes, keep the original endTime
        const adjustedEndTime = block.endTime;

        const endDateLabel = getDateLabel(adjustedEndTime);
        const endTime = adjustedEndTime
          .toLocaleTimeString([], {
            timeZone: this.homey.clock.getTimezone(),
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          })
          .replace("24:", "00:");

        // Format period display - for hourly data, we want clear time ranges
        // For hourly blocks from API, the endTime of a block is actually the start time of the next hour

        let formattedPeriod;

        // Always use the simple format: "Today 14:00-15:00" or "Today 14:00-Tomorrow 02:00"
        // This prevents the confusing situation where end time appears before start time

        // Handle the same day case
        if (startDateLabel === endDateLabel) {
          formattedPeriod = `${startDateLabel} ${startTime}`;

          // If we have multiple hours, show the range
          if (block.durationHours > 1) {
            formattedPeriod += `-${endTime}`;
          }
        } else {
          // Different days
          formattedPeriod = `${startDateLabel} ${startTime}-${endDateLabel} ${endTime}`;
        }

        // Store the original formatted times for reference
        const formattedStartTime = `${startDateLabel} ${startTime}`;
        const formattedEndTime = `${endDateLabel} ${endTime}`;

        return {
          ...block,
          formattedStartTime,
          formattedEndTime,
          formattedPeriod: `${formattedPeriod} (Avg: ${block.avgPrice.toFixed(4)} PLN/kWh)`,
          periodNumber: index + 1,
        };
      });
    };

    const formattedCheapBlocks = formatBlocks(cheapBlocks);
    const formattedExpensiveBlocks = formatBlocks(expensiveBlocks);

    // Store for next update
    this._previousBlocks = {
      cheapBlocks: formattedCheapBlocks,
      expensiveBlocks: formattedExpensiveBlocks,
    };

    // Check current usage period immediately after updating blocks
    this.checkCurrentUsagePeriod();

    // Log the results
    const priceDiffThreshold =
      this.settings.priceDiffThreshold !== undefined
        ? this.settings.priceDiffThreshold
        : 10;
    this.log(
      `--- OPTIMAL ELECTRICITY USAGE PERIODS (Price Threshold: ${priceDiffThreshold}%) ---`,
    );

    if (formattedCheapBlocks.length > 0) {
      this.log("MAXIMIZE USAGE during these cheap periods:");
      formattedCheapBlocks.forEach((block) => {
        // Enhanced logging with clear frame information
        this.log(
          `Period ${block.periodNumber}: ${block.formattedPeriod} (${block.durationHours} hour${block.durationHours > 1 ? "s" : ""}) - Avg price: ${block.avgPrice.toFixed(4)}`,
        );

        // Log detailed frame info for debugging
        if (this.getSetting("debugMode")) {
          block.frameInfo?.forEach((frame) => {
            this.log(
              `  Frame ${frame.index}: ${new Date(frame.start).toLocaleTimeString()} - ${new Date(frame.end).toLocaleTimeString()}`,
            );
          });
        }
      });
    } else {
      this.log("No cheap periods found for maximizing usage");
    }

    if (formattedExpensiveBlocks.length > 0) {
      this.log("LIMIT USAGE during these expensive periods:");
      formattedExpensiveBlocks.forEach((block) => {
        // Enhanced logging with clear frame information
        this.log(
          `Period ${block.periodNumber}: ${block.formattedPeriod} (${block.durationHours} hour${block.durationHours > 1 ? "s" : ""}) - Avg price: ${block.avgPrice.toFixed(4)}`,
        );

        // Log detailed frame info for debugging
        if (this.getSetting("debugMode")) {
          block.frameInfo?.forEach((frame) => {
            this.log(
              `  Frame ${frame.index}: ${new Date(frame.start).toLocaleTimeString()} - ${new Date(frame.end).toLocaleTimeString()}`,
            );
          });
        }
      });
    } else {
      this.log("No expensive periods found for limiting usage");
    }

    // Return the formatted blocks for use in other functions
    return {
      cheapBlocks: formattedCheapBlocks,
      expensiveBlocks: formattedExpensiveBlocks,
    };
  }

  /**
   * Merge overlapping or adjacent time blocks
   * @param {Array} blocks - Array of time blocks to merge
   * @returns {Array} Merged blocks
   */
  mergeBlocks(blocks) {
    if (!blocks || blocks.length === 0) return [];

    // Sort by start time
    const sortedBlocks = [...blocks].sort(
      (a, b) => new Date(a.startTime) - new Date(b.startTime),
    );

    const merged = [];
    let currentBlock = sortedBlocks[0];

    for (let i = 1; i < sortedBlocks.length; i++) {
      const nextBlock = sortedBlocks[i];
      const currentEnd = new Date(currentBlock.endTime);
      const nextStart = new Date(nextBlock.startTime);

      // Check for merge conditions:
      // 1. Time gap less than 2 hours AND
      // 2. Price difference less than 5% OR same price group
      const timeGap = nextStart - currentEnd;
      const priceDiff = Math.abs(currentBlock.avgPrice - nextBlock.avgPrice);
      const samePriceGroup = priceDiff < 0.0001; // Consider same price if difference < 0.01%

      // Get configurable price difference threshold (default to 10% if not set)
      const priceDiffThreshold =
        this.settings.priceDiffThreshold !== undefined
          ? this.settings.priceDiffThreshold / 100
          : 0.1;

      // Use half the threshold for merging blocks (more conservative)
      const mergeThreshold = priceDiffThreshold / 2;

      if (
        timeGap <= 7200000 &&
        (priceDiff < currentBlock.avgPrice * mergeThreshold || samePriceGroup)
      ) {
        // Merge the blocks
        currentBlock.endTime = new Date(
          Math.max(currentEnd, nextBlock.endTime),
        );

        // Merge frames while maintaining chronological order
        const combinedFrames = [
          ...currentBlock.frames,
          ...nextBlock.frames,
        ].sort((a, b) => new Date(a.start) - new Date(b.start));

        // Remove duplicates (same start time)
        const uniqueFrames = [];
        const frameStartTimes = new Set();

        for (const frame of combinedFrames) {
          if (!frameStartTimes.has(frame.start)) {
            frameStartTimes.add(frame.start);
            uniqueFrames.push(frame);
          }
        }

        currentBlock.frames = uniqueFrames;

        // Use frame count for duration - most accurate for hourly data
        currentBlock.durationHours = currentBlock.frames.length;

        // Recalculate average price based on all frames
        currentBlock.avgPrice =
          currentBlock.frames.reduce(
            (sum, frame) => sum + frame.price_gross,
            0,
          ) / currentBlock.frames.length;

        // Rebuild frameInfo for continuity
        currentBlock.frameInfo = currentBlock.frames.map((frame, index) => ({
          index,
          start: new Date(frame.start).toISOString(),
          end: new Date(frame.end).toISOString(),
          price: frame.price_gross,
        }));
      } else {
        merged.push(currentBlock);
        currentBlock = nextBlock;
      }
    }

    merged.push(currentBlock);

    // Final sorting: longer duration first, then lower price
    return merged
      .sort((a, b) => {
        // Prioritize longer durations for same price groups
        if (Math.abs(a.avgPrice - b.avgPrice) < 0.0001) {
          return b.durationHours - a.durationHours;
        }
        return a.avgPrice - b.avgPrice;
      })
      .slice(0, 3); // Return top 3
  }

  async getDailyAveragePrice(apiKey) {
    // Check if we have valid cached data
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format
    
    if (this._dailyAverageCache.expires > Date.now() && 
        this._dailyAverageCache.date === currentDate) {
      this.log('Using cached daily average price');
      return this._dailyAverageCache.value;
    }

    try {
      // Clear cache if date changed
      this._dailyAverageCache = { value: null, expires: null, date: null };

      // Get price refresh hour from settings
      const refreshHour = this.settings.priceRefreshHour || 15;

      // Calculate expiration time (next refresh hour)
      const expires = new Date();
      if (expires.getHours() >= refreshHour) {
        expires.setDate(expires.getDate() + 1);
      }
      expires.setHours(refreshHour, 0, 0, 0);

      // First try to get daily average from daily resolution API
      const dailyResponse = await this.apiRequest(
        "/integrations/pricing/",
        {
          resolution: "day",
          window_start: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
          window_end: new Date().toISOString().split('T')[0] + 'T23:59:59Z',
        },
        apiKey,
      );

      if (dailyResponse?.frames?.[0]?.price_gross_avg) {
        this._dailyAverageCache = {
          value: dailyResponse.frames[0].price_gross_avg,
          expires: expires.getTime(),
          date: currentDate,
        };
        this.log('Stored daily average from API response');
        return this._dailyAverageCache.value;
      }

      // Fallback to hourly calculation only if daily data not available
      this.log('Calculating daily average from hourly prices');
      const hourlyResponse = await this.apiRequest(
        "/integrations/pricing/",
        {
          resolution: "hour",
          window_start: new Date().toISOString().split('T')[0] + 'T00:00:00Z',
          window_end: new Date().toISOString().split('T')[0] + 'T23:59:59Z',
        },
        apiKey,
      );

      if (hourlyResponse?.frames?.length > 0) {
        const sum = hourlyResponse.frames.reduce(
          (total, frame) => total + (frame.price_gross || 0),
          0,
        );
        const avg = sum / hourlyResponse.frames.length;
        
        this._dailyAverageCache = {
          value: avg,
          expires: expires.getTime(),
          date: currentDate,
        };
        return avg;
      }

      return 0;
    } catch (error) {
      this.error("Error getting daily average price:", error);
      return 0;
    }
  }

  // async getHistoricalPrices(apiKey) {
  //   const now = new Date();
  //   const windowStart = new Date(now);
  //   windowStart.setDate(now.getDate() - 7);

  //   const response = await this.apiRequest(
  //     "/integrations/pricing/",
  //     {
  //       resolution: "day",
  //       window_start: windowStart.toISOString(),
  //       window_end: now.toISOString(),
  //     },
  //     apiKey,
  //   );

  //   return response.frames.map((frame) => ({
  //     timestamp: new Date(frame.start).getTime(),
  //     price: frame.price_gross_avg,
  //   }));
  // }
};
