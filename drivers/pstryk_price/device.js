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

  async updatePrices() {
    try {
      // this.log(this.settings);
      var apiKey = this.settings["apiKey"];
      if (!apiKey) {
        this.log("API key not set in device");
        return;
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
          year: "numeric",
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
          year: "numeric",
          hourCycle: "h23",
        }) || "",
      is_cheap: currentFrame?.is_cheap || false,
      is_expensive: currentFrame?.is_expensive || false,
      frame: currentFrame || null,
    };

    // Find optimal 2+ hour periods for limiting and maximizing electricity usage
    this.findOptimalPeriods(validFrames);

    return {
      currentPriceInfo,
      cheapestHours,
      cheapestHoursValues,
    };
  }

  /**
   * Find optimal periods (2-3 hours long) for limiting and maximizing electricity usage
   * @param {Array} frames - The price frames from the API
   */
  findOptimalPeriods(frames) {
    // Only consider future frames within the next 24 hours
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(now.getHours() + 24);
    
    const futureFrames = frames.filter(frame => {
      const frameStart = new Date(frame.start);
      return frameStart > now && frameStart < tomorrow;
    });
    
    if (futureFrames.length < 2) {
      this.log("Not enough future frames to find optimal periods");
      return;
    }
    
    // Sort frames by time to ensure they're in chronological order
    const sortedFrames = [...futureFrames].sort(
      (a, b) => new Date(a.start) - new Date(b.start)
    );
    
    // Create blocks of 2 and 3 hours only
    const allBlocks = [];
    
    // Create blocks of 2 and 3 hours
    for (let blockSize = 2; blockSize <= 3; blockSize++) {
      for (let i = 0; i <= sortedFrames.length - blockSize; i++) {
        const block = sortedFrames.slice(i, i + blockSize);
        const startTime = new Date(block[0].start);
        const endTime = new Date(block[block.length - 1].end);
        
        // Verify this is actually the correct duration block
        const durationMs = endTime - startTime;
        const durationHours = durationMs / (1000 * 60 * 60);
        
        // Allow small tolerance for each block size
        const expectedHours = blockSize;
        if (durationHours >= expectedHours - 0.1 && durationHours <= expectedHours + 0.1) {
          const avgPrice = block.reduce((sum, frame) => sum + frame.price_gross, 0) / block.length;
          
          allBlocks.push({
            startTime,
            endTime,
            durationHours: block.length,
            avgPrice,
            frames: block
          });
        }
      }
    }
    
    if (allBlocks.length === 0) {
      this.log("No valid blocks found for analysis");
      return;
    }
    
    // Debug info
    this.log(`Found ${allBlocks.length} blocks of 2-3 hours length`);
    
    // Function to find the best non-overlapping blocks
    const findBestBlocks = (blocks, byPrice, maxBlocks = 2) => {
      // Sort blocks by price (ascending for cheap, descending for expensive)
      const sortedBlocks = [...blocks].sort((a, b) => 
        byPrice === 'cheap' ? a.avgPrice - b.avgPrice : b.avgPrice - a.avgPrice
      );
      
      const selectedBlocks = [];
      
      // Select the best blocks that don't overlap
      for (const block of sortedBlocks) {
        // Check if this block overlaps with any already selected block
        const overlaps = selectedBlocks.some(selectedBlock => {
          return (block.startTime < selectedBlock.endTime && block.endTime > selectedBlock.startTime);
        });
        
        if (!overlaps) {
          selectedBlocks.push(block);
          if (selectedBlocks.length >= maxBlocks) break;
        }
      }
      
      // Check for consecutive hours with similar prices to extend blocks
      const extendedBlocks = [];
      
      for (const block of selectedBlocks) {
        let extendedBlock = {...block};
        const blockEndTime = new Date(block.endTime);
        
        // Look for frames that come right after this block with similar price
        const nextFrames = sortedFrames.filter(frame => {
          const frameStart = new Date(frame.start);
          // Check if frame starts right after block ends (within 5 minutes tolerance)
          return Math.abs(frameStart - blockEndTime) < 5 * 60 * 1000;
        });
        
        if (nextFrames.length > 0) {
          const nextFrame = nextFrames[0];
          // Check if price is similar (within 10% of average price)
          const priceDiffPercent = Math.abs(nextFrame.price_gross - block.avgPrice) / block.avgPrice * 100;
          
          if (priceDiffPercent <= 10) {
            // Extend the block with this frame
            const extendedFrames = [...block.frames, nextFrame];
            const newEndTime = new Date(nextFrame.end);
            const newAvgPrice = extendedFrames.reduce((sum, frame) => sum + frame.price_gross, 0) / extendedFrames.length;
            
            extendedBlock = {
              startTime: block.startTime,
              endTime: newEndTime,
              durationHours: extendedFrames.length,
              avgPrice: newAvgPrice,
              frames: extendedFrames,
              extended: true
            };
          }
        }
        
        extendedBlocks.push(extendedBlock);
      }
      
      return extendedBlocks;
    };
    
    // Get the cheapest blocks
    const cheapestBlocks = findBestBlocks(allBlocks, 'cheap');
    
    // Get the most expensive blocks, excluding frames used in cheap blocks
    const cheapFrameIds = new Set();
    cheapestBlocks.forEach(block => {
      block.frames.forEach(frame => {
        cheapFrameIds.add(frame.start); // Use start time as unique identifier
      });
    });
    
    // Filter out blocks that have frames already used in cheap blocks
    const remainingBlocks = allBlocks.filter(block => {
      return !block.frames.some(frame => cheapFrameIds.has(frame.start));
    });
    
    const expensiveBlocks = findBestBlocks(remainingBlocks, 'expensive');
    
    // Log the results
    this.log("--- OPTIMAL ELECTRICITY USAGE PERIODS ---");
    
    if (cheapestBlocks.length > 0) {
      this.log("MAXIMIZE USAGE during these cheap periods:");
      cheapestBlocks.forEach((block, index) => {
        const formattedStartTime = block.startTime.toLocaleString('en-US', {
          timeZone: this.homey.clock.getTimezone(),
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        });
        const formattedEndTime = block.endTime.toLocaleString('en-US', {
          timeZone: this.homey.clock.getTimezone(),
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        });
        const extendedNote = block.extended ? " (extended due to similar price)" : "";
        this.log(`Period ${index + 1}: ${formattedStartTime} to ${formattedEndTime} (${block.durationHours} hours)${extendedNote} - Avg price: ${block.avgPrice.toFixed(2)}`);
      });
    } else {
      this.log("No cheap periods found for maximizing usage");
    }
    
    if (expensiveBlocks.length > 0) {
      this.log("LIMIT USAGE during these expensive periods:");
      expensiveBlocks.forEach((block, index) => {
        const formattedStartTime = block.startTime.toLocaleString('en-US', {
          timeZone: this.homey.clock.getTimezone(),
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        });
        const formattedEndTime = block.endTime.toLocaleString('en-US', {
          timeZone: this.homey.clock.getTimezone(),
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        });
        const extendedNote = block.extended ? " (extended due to similar price)" : "";
        this.log(`Period ${index + 1}: ${formattedStartTime} to ${formattedEndTime} (${block.durationHours} hours)${extendedNote} - Avg price: ${block.avgPrice.toFixed(2)}`);
      });
    } else {
      this.log("No expensive periods found for limiting usage");
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
