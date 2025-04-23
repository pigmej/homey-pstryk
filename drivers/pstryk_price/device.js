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

    this._hasRefreshedToday = false;
    this._previousBlocks = null;
    
    // Add periodic check for current usage period
    this._currentCheckInterval = this.homey.setInterval(() => {
      this.checkCurrentUsagePeriod();
    }, 60 * 1000); // Check every minute
    
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
      this.setupPriceRefresh();
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
  }
  
  /**
   * Check if current time is within a maximise or minimise usage period
   */
  checkCurrentUsagePeriod() {
    const now = new Date();
    let isMaximise = false;
    let isMinimise = false;

    if (this._previousBlocks) {
      // Check maximise periods
      isMaximise = this._previousBlocks.cheapBlocks.some(block => {
        const blockStart = block.startTime instanceof Date ? 
          block.startTime : new Date(block.startTime);
        const blockEnd = block.endTime instanceof Date ? 
          block.endTime : new Date(block.endTime);
        return now >= blockStart && now < blockEnd;
      });

      // Check minimise periods
      isMinimise = this._previousBlocks.expensiveBlocks.some(block => {
        const blockStart = block.startTime instanceof Date ? 
          block.startTime : new Date(block.startTime);
        const blockEnd = block.endTime instanceof Date ? 
          block.endTime : new Date(block.endTime);
        return now >= blockStart && now < blockEnd;
      });
    }

    // Update capabilities
    this.setCapabilityValue("maximise_usage_now", isMaximise)
      .catch(err => this.error('Error setting maximise_usage_now:', err));
    this.setCapabilityValue("minimise_usage_now", isMinimise)
      .catch(err => this.error('Error setting minimise_usage_now:', err));
    
    this.log(`Current usage period check: Maximise=${isMaximise}, Minimise=${isMinimise}`);
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
   * Set up the daily price refresh interval
   */
  async setupPriceRefresh() {
    const refreshHour = this.settings.priceRefreshHour || 15;
    
    this.log(`Setting up daily price refresh at hour ${refreshHour}`);
    
    this._priceRefreshInterval = setInterval(() => {
      const now = new Date();
      const isRefreshTime = now.getHours() === refreshHour && 
                           now.getMinutes() >= 0 && 
                           now.getMinutes() < 5; // 5-minute window for refresh
      
      if (isRefreshTime && !this._hasRefreshedToday) {
        this.log('Daily price refresh triggered');
        this.updatePrices();
        this._hasRefreshedToday = true;
      } else if (now.getHours() !== refreshHour) {
        this._hasRefreshedToday = false;
      }
    }, 60 * 1000); // Check every minute
  }

  async updatePrices() {
    try {
      // this.log(this.settings);
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
      
      // Get prices for next 24 hours and cheapest times
      const { currentPriceInfo, cheapestHours, cheapestHoursValues } =
        await this.getCurrentPrice(apiKey);

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
      return frameStart > now && frameStart < cutoff;
    });

    if (futureFrames.length === 0) {
      this.log("No future frames available to find optimal periods");
      return { cheapBlocks: [], expensiveBlocks: [] };
    }

    // Function to find optimal blocks by processing frames in price order
    const findOptimalBlocks = (frames, isAscending = true) => {
      // Create a copy of frames that we can modify
      const availableFrames = [...frames];

      // Sort by price (ascending for cheap, descending for expensive)
      availableFrames.sort((a, b) => {
        return isAscending
          ? a.price_gross - b.price_gross
          : b.price_gross - a.price_gross;
      });

      const blocks = [];

      // Process frames until we have 3 blocks or run out of frames
      while (availableFrames.length > 0 && blocks.length < 3) {
        // Take the first frame (cheapest or most expensive)
        const startFrame = availableFrames.shift();

        // Start a new block with this frame
        const block = {
          startTime: new Date(startFrame.start),
          endTime: new Date(startFrame.end),
          durationHours: 1,
          avgPrice: startFrame.price_gross,
          frames: [startFrame],
        };

        // Try to extend the block with consecutive hours
        let extended = true;

        // Keep extending until we can't anymore or reach 3 hours
        while (extended && block.frames.length < 3) {
          extended = false;

          // Find the next consecutive frame
          const lastFrameEnd = new Date(
            block.frames[block.frames.length - 1].end,
          );

          // Find index of next consecutive frame in available frames
          const nextFrameIndex = availableFrames.findIndex((frame) => {
            const frameStart = new Date(frame.start);
            // Check if frame starts right after block ends (within 5 minutes)
            return Math.abs(frameStart - lastFrameEnd) < 5 * 60 * 1000;
          });

          if (nextFrameIndex !== -1) {
            const nextFrame = availableFrames[nextFrameIndex];

            // Check if price is similar (within 5%)
            const priceDiff = Math.abs(nextFrame.price_gross - block.avgPrice);
            const priceDiffPercent = (priceDiff / block.avgPrice) * 100;

            if (priceDiffPercent <= 10) {
              // Remove this frame from available frames
              availableFrames.splice(nextFrameIndex, 1);

              // Add to the block
              block.frames.push(nextFrame);
              block.endTime = new Date(nextFrame.end);
              block.durationHours = block.frames.length;
              block.avgPrice =
                block.frames.reduce((sum, f) => sum + f.price_gross, 0) /
                block.frames.length;
              block.extended = true;

              extended = true;
            }
          }
        }

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
      const validCheapBlocks = this._previousBlocks.cheapBlocks?.filter(block => 
        new Date(block.endTime) > now
      ) || [];
      
      const validExpensiveBlocks = this._previousBlocks.expensiveBlocks?.filter(block => 
        new Date(block.endTime) > now
      ) || [];
      
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
        const formattedStartTime = block.startTime.toLocaleString([], {
          timeZone: this.homey.clock.getTimezone(),
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
          hourCycle: "h23",
        });

        const formattedEndTime = block.endTime.toLocaleString([], {
          timeZone: this.homey.clock.getTimezone(),
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
          hourCycle: "h23",
        });

        const validUntil = block.endTime.toLocaleDateString([], {
          timeZone: this.homey.clock.getTimezone(),
          day: "2-digit",
          month: "2-digit",
        });

        return {
          ...block,
          formattedStartTime,
          formattedEndTime,
          formattedPeriod: `${formattedStartTime} to ${formattedEndTime} (Avg: ${block.avgPrice.toFixed(4)} PLN/kWh, Valid until ${validUntil})`,
          periodNumber: index + 1,
        };
      });
    };

    const formattedCheapBlocks = formatBlocks(cheapBlocks);
    const formattedExpensiveBlocks = formatBlocks(expensiveBlocks);
    
    // Store for next update
    this._previousBlocks = {
      cheapBlocks: formattedCheapBlocks,
      expensiveBlocks: formattedExpensiveBlocks
    };
      
    // Check current usage period immediately after updating blocks
    this.checkCurrentUsagePeriod();

    // Log the results
    this.log("--- OPTIMAL ELECTRICITY USAGE PERIODS ---");

    if (formattedCheapBlocks.length > 0) {
      this.log("MAXIMIZE USAGE during these cheap periods:");
      formattedCheapBlocks.forEach((block) => {
        this.log(
          `Period ${block.periodNumber}: ${block.formattedPeriod} (${block.durationHours} hours) - Avg price: ${block.avgPrice.toFixed(2)}`,
        );
      });
    } else {
      this.log("No cheap periods found for maximizing usage");
    }

    if (formattedExpensiveBlocks.length > 0) {
      this.log("LIMIT USAGE during these expensive periods:");
      formattedExpensiveBlocks.forEach((block) => {
        this.log(
          `Period ${block.periodNumber}: ${block.formattedPeriod} (${block.durationHours} hours) - Avg price: ${block.avgPrice.toFixed(2)}`,
        );
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
    
    // Sort blocks by start time
    const sortedBlocks = [...blocks].sort((a, b) => 
      new Date(a.startTime) - new Date(b.startTime)
    );
    
    return sortedBlocks.reduce((merged, block) => {
      // Convert dates to Date objects if they're strings
      const blockStart = block.startTime instanceof Date ? 
        block.startTime : new Date(block.startTime);
      const blockEnd = block.endTime instanceof Date ? 
        block.endTime : new Date(block.endTime);
      
      const last = merged[merged.length - 1];
      
      if (last) {
        const lastEnd = last.endTime instanceof Date ? 
          last.endTime : new Date(last.endTime);
        
        // If this block starts within 15 minutes of the last block ending, merge them
        if (blockStart - lastEnd <= 15 * 60 * 1000) {
          // Merge the blocks
          last.endTime = new Date(Math.max(lastEnd, blockEnd));
          last.durationHours = Math.round(
            (last.endTime - last.startTime) / (1000 * 60 * 60)
          );
          // Average the prices
          last.avgPrice = (last.avgPrice + block.avgPrice) / 2;
          return merged;
        }
      }
      
      // Add as a new block
      merged.push({
        ...block,
        startTime: blockStart,
        endTime: blockEnd
      });
      
      return merged;
    }, []);
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
