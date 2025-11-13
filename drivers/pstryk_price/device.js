"use strict";

const Homey = require("homey");

/**
 * Internal State Updater class for managing hour boundary detection
 */
class InternalStateUpdater {
  constructor(device) {
    this.device = device;
    this.lastHour = null;
    this.updateInterval = null;
  }

  detectHourBoundary() {
    const now = new Date();
    const currentHour = now.getHours();

    if (this.lastHour !== currentHour) {
      this.lastHour = currentHour;
      return true;
    }
    return false;
  }

  async updateCurrentHourCapabilities() {
    try {
      // Invalidate price tiers cache when hour changes
      this.device._invalidatePriceTiersCache();
      await this.device.updateCapabilitiesFromCache();
    } catch (error) {
      this.device.error("Error updating current hour capabilities:", error);
    }
  }

  async updatePeriodCapabilities() {
    try {
      await this.device.updateUsagePeriodsFromCache();
    } catch (error) {
      this.device.error("Error updating period capabilities:", error);
    }
  }

  startHourBoundaryDetection() {
    // Check every minute for hour boundary
    this.updateInterval = this.device.homey.setInterval(async () => {
      if (this.detectHourBoundary()) {
        this.device.log("Hour boundary detected, updating capabilities");
        await this.updateCurrentHourCapabilities();
        await this.updatePeriodCapabilities();
      }
    }, 60 * 1000); // Check every minute
  }

  stopHourBoundaryDetection() {
    if (this.updateInterval) {
      this.device.homey.clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}

module.exports = class PstrykPriceDevice extends Homey.Device {
  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log("PstrykPriceDevice has been initialized");
    this.settings = await this.getSettings();

    // Initialize price tiers cache for tied ranking
    this._priceTiersCache = {};

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
    await this.addCapability("current_hour_price_position");
    await this.addCapability("cache_status");

    this._previousBlocks = null;
    this._cachedData = null;

    // Initialize internal state updater
    this.internalStateUpdater = new InternalStateUpdater(this);

    // Add periodic check for current usage period (reduced frequency)
    this._currentCheckInterval = this.homey.setInterval(
      () => {
        this.checkCurrentUsagePeriod();
      },
      5 * 60 * 1000,
    ); // Check every 5 minutes

    // Start hour boundary detection
    this.internalStateUpdater.startHourBoundaryDetection();

    // Register for cache updates from driver - store bound reference for proper cleanup
    this._handleCacheUpdateBound = this.handleCacheUpdate.bind(this);
    this.driver.on('cache-updated', this._handleCacheUpdateBound);

    // Register for cache status changes
    this._handleCacheStatusBound = this.handleCacheStatusChange.bind(this);
    this.driver.on('cache-status-changed', this._handleCacheStatusBound);

    // Initial update request to driver
    setTimeout(() => this.requestCacheUpdate(), 2000);
  }

  /**
   * Handle cache updates from driver
   */
  async handleCacheUpdate(cachedData) {
    this.log("Received cache update from driver");
    this._cachedData = cachedData;
    
    // Invalidate price tiers cache when new data arrives
    this._invalidatePriceTiersCache();
    
    // Update cache status capability
    const status = cachedData.isStale ? 'stale' : 'fresh';
    await this.setCapabilityValue("cache_status", status);
    
    // Update all capabilities from cached data
    await this.updateCapabilitiesFromCache();
    await this.updateUsagePeriodsFromCache();
  }

  /**
   * Handle cache status changes from driver
   */
  async handleCacheStatusChange(statusInfo) {
    this.log("Cache status changed:", statusInfo);
    await this.setCapabilityValue("cache_status", statusInfo.status);
  }

  /**
   * Request cache update from driver
   */
  async requestCacheUpdate() {
    try {
      await this.driver.updatePrices();
    } catch (error) {
      this.error("Error requesting cache update:", error);
    }
  }

  /**
   * Update capabilities from cached data
   */
  async updateCapabilitiesFromCache() {
    if (!this._cachedData || !this._cachedData.currentPrices) {
      this.log("No cached data available for capability update");
      return;
    }

    try {
      const now = new Date();
      const currentPrices = this._cachedData.currentPrices;
      
      // Find current frame
      const currentFrame = currentPrices.find((frame) => {
        const frameStart = new Date(frame.start);
        const frameEnd = new Date(frame.end);
        return now >= frameStart && now < frameEnd;
      });

      if (!currentFrame) {
        this.log("No current frame found in cached data");
        return;
      }

      // Update basic price capabilities
      await this.setCapabilityValue("current_hour_price", currentFrame.price_gross);
      await this.setCapabilityValue("current_hour_value", 
        new Date(currentFrame.start).toLocaleString([], {
          timeZone: this.homey.clock.getTimezone(),
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
          hourCycle: "h23",
        })
      );
      await this.setCapabilityValue("currently_cheap", currentFrame.is_cheap);
      await this.setCapabilityValue("currently_expensive", currentFrame.is_expensive);

      // Update daily average
      if (this._cachedData.dailyAverage) {
        await this.setCapabilityValue("daily_average_price", this._cachedData.dailyAverage);
      }

      // Update cheapest hours
      const futureFrames = currentPrices.filter(
        (frame) => new Date(frame.start) > now
      );
      const cheapestFrames = [...futureFrames].sort((a, b) => a.price_gross - b.price_gross).slice(0, 3);

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

      const cheapestHoursValues = cheapestFrames.map((frame) => frame.price_gross);

      await this.setCapabilityValue("cheapest_h0", cheapestHours[0]);
      await this.setCapabilityValue("cheapest_h0_value", cheapestHoursValues[0]);
      await this.setCapabilityValue("cheapest_h1", cheapestHours[1]);
      await this.setCapabilityValue("cheapest_h1_value", cheapestHoursValues[1]);
      await this.setCapabilityValue("cheapest_h2", cheapestHours[2]);
      await this.setCapabilityValue("cheapest_h2_value", cheapestHoursValues[2]);

      // Update cheapest hour rankings
      await this.updateCheapestHourRankings(currentPrices, currentFrame);

      // Update price position capability
      await this.updatePricePositionCapability();

      // Store frames for helper functions
      this._validFrames = currentPrices;
      this._currentFrame = currentFrame;

    } catch (error) {
      this.error("Error updating capabilities from cache:", error);
    }
  }

  /**
   * Update cheapest hour rankings for different time windows
   */
  async updateCheapestHourRankings(currentPrices, currentFrame) {
    const calculateCheapestHourRank = (hourWindow) => {
      if (!currentFrame) return 0;

      const now = new Date();
      const windowEnd = new Date(now);
      windowEnd.setHours(now.getHours() + hourWindow);

      const windowFrames = currentPrices.filter((frame) => {
        const frameStart = new Date(frame.start);
        return frameStart >= now && frameStart < windowEnd;
      });

      let framesWithCurrentHour = [...windowFrames];
      if (!framesWithCurrentHour.some((frame) => frame.start === currentFrame.start)) {
        framesWithCurrentHour.push(currentFrame);
      }

      const sortedFrames = framesWithCurrentHour.sort((a, b) => a.price_gross - b.price_gross);
      const currentFrameIndex = sortedFrames.findIndex((frame) => frame.start === currentFrame.start);

      if (currentFrameIndex === 0) return 1;
      if (currentFrameIndex === 1) return 2;
      if (currentFrameIndex === 2) return 3;
      return 0;
    };

    const currentHourInCheapestValue = calculateCheapestHourRank(8);
    const currentHourInCheapest4hValue = calculateCheapestHourRank(4);
    const currentHourInCheapest12hValue = calculateCheapestHourRank(12);
    const currentHourInCheapest24hValue = calculateCheapestHourRank(24);
    const currentHourInCheapest36hValue = calculateCheapestHourRank(36);

    await this.setCapabilityValue("current_hour_in_cheapest", currentHourInCheapestValue);
    await this.setCapabilityValue("current_hour_in_cheapest_4h", currentHourInCheapest4hValue);
    await this.setCapabilityValue("current_hour_in_cheapest_12h", currentHourInCheapest12hValue);
    await this.setCapabilityValue("current_hour_in_cheapest_24h", currentHourInCheapest24hValue);
    await this.setCapabilityValue("current_hour_in_cheapest_36h", currentHourInCheapest36hValue);
  }

  /**
   * Update usage periods from cached data
   */
  async updateUsagePeriodsFromCache() {
    if (!this._cachedData || !this._cachedData.currentPrices) {
      return;
    }

    try {
      const { cheapBlocks, expensiveBlocks } = this.findOptimalPeriods(this._cachedData.currentPrices);

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

      // Store for current usage period checking
      this._previousBlocks = {
        cheapBlocks: cheapBlocks,
        expensiveBlocks: expensiveBlocks,
      };

    } catch (error) {
      this.error("Error updating usage periods from cache:", error);
    }
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
      this.log("API key changed, requesting cache refresh");
      this.driver.apiOrchestrator.requestManualRefresh();
      this.requestCacheUpdate();
    }

    if (changedKeys.includes("priceRefreshHour")) {
      this.log("Price refresh hour changed, cache will refresh at new time");
      // Cache refresh logic is handled by the driver
    }

    if (
      changedKeys.includes("todayLabel") ||
      changedKeys.includes("tomorrowLabel") ||
      changedKeys.includes("priceDiffThreshold")
    ) {
      if (changedKeys.includes("priceDiffThreshold")) {
        this.log("Price difference threshold changed to", newSettings.priceDiffThreshold + "%");
      } else {
        this.log("Date labels changed, updating periods");
      }
      // Update periods from existing cache with new settings
      this.updateUsagePeriodsFromCache();
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

    // Clear the current check interval
    if (this._currentCheckInterval) {
      this.homey.clearInterval(this._currentCheckInterval);
    }

    // Stop hour boundary detection
    if (this.internalStateUpdater) {
      this.internalStateUpdater.stopHourBoundaryDetection();
    }

    // Remove cache update listener - use stored bound reference
    if (this._handleCacheUpdateBound) {
      this.driver.removeListener('cache-updated', this._handleCacheUpdateBound);
    }

    // Remove cache status listener - use stored bound reference
    if (this._handleCacheStatusBound) {
      this.driver.removeListener('cache-status-changed', this._handleCacheStatusBound);
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
        const blockStart = block.startTime instanceof Date ? block.startTime : new Date(block.startTime);
        const blockEnd = block.endTime instanceof Date ? block.endTime : new Date(block.endTime);
        return now >= blockStart && now <= blockEnd; // Changed to <= to include end time
      });

      // Check minimise periods with inclusive end time
      isMinimise = this._previousBlocks.expensiveBlocks.some((block) => {
        const blockStart = block.startTime instanceof Date ? block.startTime : new Date(block.startTime);
        const blockEnd = block.endTime instanceof Date ? block.endTime : new Date(block.endTime);
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
      this.log(`Usage period changed: Maximise=${isMaximise}, Minimise=${isMinimise}`);
    }
  }

  /**
   * Legacy updatePrices method - now forwards to cache-based approach
   */
  async updatePrices() {
    this.log("updatePrices called - requesting cache refresh");
    await this.requestCacheUpdate();
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
        return isAscending ? a.price_gross - b.price_gross : b.price_gross - a.price_gross;
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
        const frameDuration = new Date(startFrame.end) - new Date(startFrame.start);

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

          const lastFrameEnd = new Date(block.frames[block.frames.length - 1].end);

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
            if (frame.price_gross === block.avgPrice && timeDiff < bestTimeDiff) {
              bestFrame = frame;
              bestTimeDiff = timeDiff;
            }
          });

          // If no exact price match found, look for nearby frames with small price difference
          if (!bestFrame) {
            // Get configurable price difference threshold (default to 10% if not set)
            const priceDiffThreshold =
              this.settings.priceDiffThreshold !== undefined ? this.settings.priceDiffThreshold / 100 : 0.1;

            adjacentFrames.forEach((frame) => {
              const priceDiff = Math.abs(frame.price_gross - block.avgPrice);
              const timeDiff = Math.abs(new Date(frame.start) - lastFrameEnd);

              if (priceDiff <= block.avgPrice * priceDiffThreshold && timeDiff < bestTimeDiff) {
                bestFrame = frame;
                bestTimeDiff = timeDiff;
              }
            });
          }

          if (bestFrame) {
            const frameIndex = availableFrames.findIndex((f) => f.start === bestFrame.start);
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
            block.avgPrice = block.frames.reduce((sum, f) => sum + f.price_gross, 0) / block.frames.length;

            // Verify and enforce time continuity - calculate duration based on frame count
            // For hourly data, each frame should be 1 hour, so use frame count directly
            block.durationHours = block.frames.length;

            // Double-check start/end times and log any irregularities
            const startToEndDuration = (block.endTime - block.startTime) / 3600000;
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
      const validCheapBlocks = this._previousBlocks.cheapBlocks?.filter((block) => new Date(block.endTime) > now) || [];

      const validExpensiveBlocks =
        this._previousBlocks.expensiveBlocks?.filter((block) => new Date(block.endTime) > now) || [];

      // Merge with new blocks
      if (validCheapBlocks.length > 0) {
        cheapBlocks = this.mergeBlocks([...validCheapBlocks, ...cheapBlocks]);
      }

      if (validExpensiveBlocks.length > 0) {
        expensiveBlocks = this.mergeBlocks([...validExpensiveBlocks, ...expensiveBlocks]);
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
    const priceDiffThreshold = this.settings.priceDiffThreshold !== undefined ? this.settings.priceDiffThreshold : 10;
    this.log(`--- OPTIMAL ELECTRICITY USAGE PERIODS (Price Threshold: ${priceDiffThreshold}%) ---`);

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
    const sortedBlocks = [...blocks].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

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
        this.settings.priceDiffThreshold !== undefined ? this.settings.priceDiffThreshold / 100 : 0.1;

      // Use half the threshold for merging blocks (more conservative)
      const mergeThreshold = priceDiffThreshold / 2;

      if (timeGap <= 7200000 && (priceDiff < currentBlock.avgPrice * mergeThreshold || samePriceGroup)) {
        // Merge the blocks
        currentBlock.endTime = new Date(Math.max(currentEnd, nextBlock.endTime));

        // Merge frames while maintaining chronological order
        const combinedFrames = [...currentBlock.frames, ...nextBlock.frames].sort(
          (a, b) => new Date(a.start) - new Date(b.start),
        );

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
          currentBlock.frames.reduce((sum, frame) => sum + frame.price_gross, 0) / currentBlock.frames.length;

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



  /**
   * Calculate exact position of current hour when sorted by price
   * @param {number} hourWindow - The time window in hours
   * @param {boolean} cheapestFirst - If true, sort cheapest to expensive. If false, sort expensive to cheapest
   * @returns {Object} Object containing position and total hours
   */
  calculateExactPricePosition(hourWindow, cheapestFirst = true) {
    // Use cached data if available
    const validFrames = this._cachedData?.currentPrices || this._validFrames || [];
    const currentFrame = this._currentFrame;

    if (!currentFrame || validFrames.length === 0) {
      return { position: 0, totalHours: 0 };
    }

    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setHours(now.getHours() + hourWindow);

    // Get all frames within the window (including the current hour)
    const windowFrames = validFrames.filter((frame) => {
      const frameStart = new Date(frame.start);
      return frameStart >= now && frameStart < windowEnd;
    });

    // Add current hour to window frames if not already included
    let framesWithCurrentHour = [...windowFrames];
    if (!framesWithCurrentHour.some((frame) => frame.start === currentFrame.start)) {
      framesWithCurrentHour.push(currentFrame);
    }

    if (framesWithCurrentHour.length === 0) {
      return { position: 0, totalHours: 0 };
    }

    // Sort frames by price
    const sortedFrames = framesWithCurrentHour.sort((a, b) => {
      return cheapestFirst ? a.price_gross - b.price_gross : b.price_gross - a.price_gross;
    });

    // Find current frame's position in the sorted list (1-based)
    const currentFrameIndex = sortedFrames.findIndex((frame) => frame.start === currentFrame.start);

    const position = currentFrameIndex >= 0 ? currentFrameIndex + 1 : 0;
    const totalHours = sortedFrames.length;

    this.log(
      `Current hour position: ${position}/${totalHours} in ${hourWindow}-hour window (${cheapestFirst ? "cheapest first" : "expensive first"})`,
    );

    return { position, totalHours };
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

  /**
   * Calculates price position using tiered ranking for fair tie handling
   * @param {number} hourWindow - Time window in hours (4, 8, 12, 24, 36)
   * @returns {number} Position value (1.0, 2.0, 3.0, etc.) with consistent floating-point precision
   */
  calculateTiedPricePosition(hourWindow) {
    try {
      // Check cache first
      const cached = this._priceTiersCache[hourWindow];
      if (cached && cached.valid && this._isCacheValid(cached.timestamp)) {
        this.log("Using cached price position:", cached.currentHourPosition);
        return Number(cached.currentHourPosition.toFixed(1)); // Consistent precision
      }

      // Perform tiered ranking calculation with precise floating-point handling
      const position = this._calculateTiedPosition(hourWindow);
      const precisePosition = Number(position.toFixed(1)); // Ensure consistent decimal precision

      // Update cache with new results
      this._updatePriceTiersCache(hourWindow, precisePosition);

      return precisePosition;
    } catch (error) {
      this.error("Error calculating tied price position:", error);
      // Fallback to safe default with consistent precision
      return 12.0;
    }
  }

  /**
   * Checks if cache entry is still valid
   * @param {number} timestamp - Cache timestamp
   * @returns {boolean} True if cache is valid
   */
  _isCacheValid(timestamp) {
    return Date.now() - timestamp < 300000; // 5 minute cache validity
  }

  /**
   * Updates price tiers cache with new calculation results
   * @param {number} windowSize - Time window size
   * @param {number} position - Calculated position
   */
  _updatePriceTiersCache(windowSize, position) {
    this._priceTiersCache[windowSize] = {
      currentHourPosition: position,
      timestamp: Date.now(),
      valid: true,
    };
  }

  /**
   * Invalidates price tiers cache when prices are updated
   */
  _invalidatePriceTiersCache() {
    this._priceTiersCache = {};
  }

  /**
   * Core calculation logic for tied price position
   * @param {number} hourWindow - Time window in hours
   * @returns {number} Position value
   */
  _calculateTiedPosition(hourWindow) {
    // Use cached data if available
    const validFrames = this._cachedData?.currentPrices || this._validFrames || [];
    const currentFrame = this._currentFrame;

    if (!currentFrame || validFrames.length === 0) {
      this.log(`No data available for ${hourWindow}h window - returning worst position ${hourWindow}`);
      return hourWindow;  // Return worst position for this window
    }

    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setHours(now.getHours() + hourWindow);

    // Get all frames within the window (including the current hour)
    const windowFrames = validFrames.filter((frame) => {
      const frameStart = new Date(frame.start);
      return frameStart >= now && frameStart < windowEnd;
    });

    // Add current hour to window frames if not already included
    let framesWithCurrentHour = [...windowFrames];
    if (!framesWithCurrentHour.some((frame) => frame.start === currentFrame.start)) {
      framesWithCurrentHour.push(currentFrame);
    }

    if (framesWithCurrentHour.length === 0) {
      this.log(`No frames in ${hourWindow}h window - returning worst position ${hourWindow}`);
      return hourWindow;  // Return worst position for this window
    }

    // Group frames by identical prices
    const priceTiers = this.groupFramesByPrice(framesWithCurrentHour);

    // Find current frame's position in the price tiers
    const currentTier = this.findTierForCurrentHour(priceTiers, currentFrame);

    // Assign sequential position values to tiers
    const positionedTiers = this.assignTierPositions(priceTiers);

    // Find and return the position for current tier
    const currentTierInfo = positionedTiers.find((tier) => tier.price === currentTier.price);

    return currentTierInfo ? currentTierInfo.position : 1.0;
  }

  /**
   * Groups frames by identical prices to create price tiers
   * @param {Array} frames - Array of frames to group
   * @returns {Array} Array of price tiers
   */
  groupFramesByPrice(frames) {
    const priceGroups = {};

    // Group frames by price (with floating point precision handling)
    frames.forEach((frame) => {
      const priceKey = Number(frame.price_gross.toFixed(6)); // 6 decimal precision for grouping
      if (!priceGroups[priceKey]) {
        priceGroups[priceKey] = [];
      }
      priceGroups[priceKey].push(frame);
    });

    // Convert to sorted array of price tiers
    const priceTiers = Object.keys(priceGroups).map((priceKey) => ({
      price: parseFloat(priceKey),
      frames: priceGroups[priceKey],
      count: priceGroups[priceKey].length,
    }));

    // Sort by price (cheapest first)
    return priceTiers.sort((a, b) => a.price - b.price);
  }

  /**
   * Finds the price tier that contains the current frame
   * @param {Array} priceTiers - Array of price tiers
   * @param {Object} currentFrame - The current frame to find
   * @returns {Object} The price tier containing the current frame
   */
  findTierForCurrentHour(priceTiers, currentFrame) {
    const currentPrice = Number(currentFrame.price_gross.toFixed(6));

    return (
      priceTiers.find(
        (tier) => Math.abs(tier.price - currentPrice) < 0.000001, // Floating point comparison tolerance
      ) || priceTiers[0]
    ); // Fallback to cheapest tier
  }

  /**
   * Assigns sequential position values to price tiers
   * @param {Array} priceTiers - Array of price tiers sorted by price
   * @returns {Array} Price tiers with assigned positions
   */
  assignTierPositions(priceTiers) {
    return priceTiers.map((tier, index) => ({
      ...tier,
      position: index + 1.0, // 1.0, 2.0, 3.0, etc.
    }));
  }

  /**
   * Updates the current_hour_price_position capability value
   */
  async updatePricePositionCapability() {
    try {
      // Calculate position for default 24h window
      const position = this.calculateTiedPricePosition(24);
      await this.setCapabilityValue("current_hour_price_position", position);
      this.log("Updated current_hour_price_position capability:", position);
    } catch (error) {
      this.error("Error updating current_hour_price_position capability:", error);
    }
  }

  /**
   * Flow action handler for manual price data refresh
   */
  async onActionRefreshPriceData(args, state) {
    try {
      this.log("Manual price data refresh triggered via flow action");
      
      // Call the new immediate refresh method from API orchestrator
      // This method handles rate limiting centrally and provides user feedback
      await this.driver.apiOrchestrator.requestManualRefreshImmediate();
      
      this.log("Manual price data refresh completed successfully");
      
      return true;
    } catch (error) {
      this.error("Error in manual price data refresh:", error);
      throw error; // Re-throw to let Homey handle the error in the flow
    }
  }
};
