"use strict";

const Homey = require("homey");
const https = require("https");

/**
 * Price Data Cache class for storing and validating price data
 */
class PriceDataCache {
  constructor() {
    this.currentPrices = [];
    this.dailyAverage = null;
    this.lastUpdated = null;
    this.expiresAt = null;
    this.date = null;
    this.isValid = false;
  }

  isCacheValid() {
    const now = new Date();
    const currentDate = now.toLocaleDateString("en-CA");

    // Invalid if date changed
    if (this.date !== currentDate) return false;

    // Invalid if expired
    if (now.getTime() > this.expiresAt) return false;

    // Invalid if no data
    if (!this.currentPrices.length) return false;

    return true;
  }

  invalidateCache() {
    this.currentPrices = [];
    this.dailyAverage = null;
    this.lastUpdated = null;
    this.expiresAt = null;
    this.date = null;
    this.isValid = false;
  }

  updateCache(data) {
    this.currentPrices = data.currentPrices || [];
    this.dailyAverage = data.dailyAverage || null;
    this.lastUpdated = Date.now();
    this.expiresAt = data.expiresAt || null;
    this.date = data.date || null;
    this.isValid = true;
  }

  getCachedData() {
    if (!this.isCacheValid()) {
      return null;
    }

    return {
      currentPrices: this.currentPrices,
      dailyAverage: this.dailyAverage,
      lastUpdated: this.lastUpdated,
      expiresAt: this.expiresAt,
      date: this.date
    };
  }
}

/**
 * API Orchestrator class for managing API calls and cache
 */
class APIOrchestrator {
  constructor(driver) {
    this.driver = driver;
    this.cache = new PriceDataCache();
    this.isRefreshing = false;
    this.manualRefreshRequested = false;
    this.lastManualRefreshTime = 0; // Track rate limiting centrally
  }

  async shouldRefresh() {
    // Don't refresh if already refreshing
    if (this.isRefreshing) return false;

    // Refresh if cache invalid
    if (!this.cache.isCacheValid()) return true;

    // Refresh if manual request
    if (this.manualRefreshRequested) return true;

    return false;
  }

  async fetchFreshData(apiKey) {
    const now = new Date();
    const windowStart = new Date();
    windowStart.setUTCHours(windowStart.getUTCHours() - 2, 0, 0, 0);

    const windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 2);

    try {
      // Single consolidated API call
      const response = await this._apiRequest("/integrations/pricing/", {
        resolution: "hour",
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
      }, apiKey);

      // Filter out invalid frames
      const validFrames = response.frames.filter((frame) => {
        return frame.is_cheap !== null && frame.is_expensive !== null;
      });

      // Calculate daily average from hourly data if not provided
      const dailyAverage = response.daily_average || this._calculateDailyAverage(validFrames);

      // Get configurable refresh hour from first device (default to 15)
      const devices = this.driver.getDevices();
      let refreshHour = 15; // default
      if (devices.length > 0) {
        refreshHour = devices[0].getSetting("priceRefreshHour") || 15;
      }

      // Set expiration time (next day at configured hour)
      const expiresAt = new Date();
      if (expiresAt.getHours() >= refreshHour) {
        expiresAt.setDate(expiresAt.getDate() + 1);
      }
      expiresAt.setHours(refreshHour, 0, 0, 0);

      return {
        currentPrices: validFrames,
        dailyAverage: dailyAverage,
        expiresAt: expiresAt.getTime(),
        date: now.toLocaleDateString("en-CA")
      };
    } catch (error) {
      this.driver.error("API request failed, attempting graceful degradation:", error);
      
      // Try to use stale cache if available
      const staleData = this.cache.getCachedData();
      if (staleData) {
        this.driver.log("Using stale cache data due to API failure");
        // Extend stale cache expiration for 2 hours to allow retry
        const extendedExpiresAt = Date.now() + (2 * 60 * 60 * 1000);
        return {
          ...staleData,
          expiresAt: extendedExpiresAt,
          isStale: true
        };
      }
      
      throw error; // Re-throw if no stale cache available
    }
  }

  async refreshAllDevices() {
    if (this.isRefreshing) return;

    this.isRefreshing = true;
    this.manualRefreshRequested = false;

    try {
      // Get API key from first device (all devices share same key)
      const devices = this.driver.getDevices();
      if (devices.length === 0) {
        this.driver.log("No devices available for cache refresh");
        return;
      }

      const apiKey = devices[0].getSetting("apiKey");
      if (!apiKey) {
        this.driver.log("API key not available for cache refresh");
        return;
      }

      // Fetch fresh data
      const freshData = await this.fetchFreshData(apiKey);
      
      // Update cache
      this.cache.updateCache(freshData);
      
      if (freshData.isStale) {
        this.driver.log("Cache updated with stale data due to API failure");
      } else {
        this.driver.log("Cache updated successfully with fresh data");
      }

      // Notify all devices of cache update
      this.driver.emit('cache-updated', this.cache.getCachedData());
      
      // Emit success status for manual refresh feedback
      this.driver.emit('cache-status-changed', {
        status: freshData.isStale ? 'stale' : 'fresh',
        message: freshData.isStale ? 'Refresh completed with stale data' : 'Refresh completed successfully'
      });

    } catch (error) {
      this.driver.error("Error refreshing cache:", error);
      
      // Emit cache status update even on failure to allow devices to show error state
      this.driver.emit('cache-status-changed', {
        status: 'error',
        message: error.message || 'API request failed'
      });
    } finally {
      this.isRefreshing = false;
    }
  }

  requestManualRefresh() {
    this.manualRefreshRequested = true;
  }

  async requestManualRefreshImmediate() {
    // Check rate limiting (5 minute cooldown)
    const now = Date.now();
    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (now - this.lastManualRefreshTime < cooldownPeriod) {
      const remainingTime = Math.ceil((cooldownPeriod - (now - this.lastManualRefreshTime)) / 1000);
      throw new Error(`Manual refresh is on cooldown. Please wait ${remainingTime} seconds.`);
    }

    // Update rate limiting timestamp
    this.lastManualRefreshTime = now;

    // Set the flag and trigger immediate refresh
    this.manualRefreshRequested = true;
    
    // Emit refresh status to devices
    this.driver.emit('cache-status-changed', {
      status: 'refreshing',
      message: 'Manual refresh triggered'
    });

    // Trigger immediate refresh instead of waiting for timer
    await this.refreshAllDevices();
  }

  _calculateDailyAverage(frames) {
    if (!frames || frames.length === 0) return 0;

    const today = new Date().toLocaleDateString("en-CA");
    const todayFrames = frames.filter(frame => {
      const frameDate = new Date(frame.start).toLocaleDateString("en-CA");
      return frameDate === today;
    });

    if (todayFrames.length === 0) return 0;

    const sum = todayFrames.reduce((total, frame) => total + (frame.price_gross || 0), 0);
    return sum / todayFrames.length;
  }

  _apiRequest(endpoint, params, apiKey) {
    const url = new URL(`https://api.pstryk.pl${endpoint}`);
    Object.keys(params).forEach((key) => url.searchParams.append(key, params[key]));

    const options = {
      method: "GET",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        "User-Agent": "Homey-PstrykPrice/1.0.0",
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
}

module.exports = class PstrykPriceDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("Pstryk price driver has been initialized");

    // Initialize API orchestrator (singleton cache manager)
    this.apiOrchestrator = new APIOrchestrator(this);

    // Register flow conditions
    this._registerFlowConditions();

    // Register flow actions
    this._registerFlowActions();

    // Register flow triggers
    this._registerFlowTriggers();

    // Start cache refresh timer
    this._startCacheRefreshTimer();

    // Initial cache update for all devices
    setTimeout(() => this.apiOrchestrator.refreshAllDevices(), 2000);
  }

  /**
   * Start scheduled cache refresh timer
   */
  _startCacheRefreshTimer() {
    // Schedule refresh at specific time instead of hourly polling
    this._scheduleNextRefresh();
    
    // Also check every 30 minutes as a fallback
    this._cacheCheckInterval = this.homey.setInterval(async () => {
      if (await this.apiOrchestrator.shouldRefresh()) {
        await this.apiOrchestrator.refreshAllDevices();
        // Reschedule next refresh after successful update
        this._scheduleNextRefresh();
      }
    }, 30 * 60 * 1000); // Check every 30 minutes
  }

  /**
   * Schedule the next refresh for the configured hour
   */
  _scheduleNextRefresh() {
    // Clear any existing timeout
    if (this._refreshTimeout) {
      this.homey.clearTimeout(this._refreshTimeout);
    }

    const now = new Date();
    const devices = this.getDevices();
    let refreshHour = 15; // default
    
    // Get configurable refresh hour from first device
    if (devices.length > 0) {
      refreshHour = devices[0].getSetting("priceRefreshHour") || 15;
    }

    // Calculate next refresh time
    const nextRefresh = new Date();
    nextRefresh.setHours(refreshHour, 0, 0, 0);
    
    // If today's refresh time has passed, schedule for tomorrow
    if (now >= nextRefresh) {
      nextRefresh.setDate(nextRefresh.getDate() + 1);
    }

    const timeUntilRefresh = nextRefresh.getTime() - now.getTime();
    this.log(`Scheduling next cache refresh for ${nextRefresh.toISOString()} (in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes)`);

    // Schedule the refresh
    this._refreshTimeout = this.homey.setTimeout(async () => {
      this.log("Executing scheduled cache refresh");
      await this.apiOrchestrator.refreshAllDevices();
      // Schedule the next one
      this._scheduleNextRefresh();
    }, timeUntilRefresh);
  }

  /**
   * Register flow actions
   */
  _registerFlowActions() {
    // Get current hour cheapest rank (8h window)
    this.homey.flow.getActionCard('get_current_hour_in_cheapest')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const rank = device.getCapabilityValue('current_hour_in_cheapest');
        return { rank };
      });

    // Get current hour cheapest rank (4h window)
    this.homey.flow.getActionCard('get_current_hour_in_cheapest_4h')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const rank = device.getCapabilityValue('current_hour_in_cheapest_4h');
        return { rank };
      });

    // Get current hour cheapest rank (12h window)
    this.homey.flow.getActionCard('get_current_hour_in_cheapest_12h')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const rank = device.getCapabilityValue('current_hour_in_cheapest_12h');
        return { rank };
      });

    // Get current hour cheapest rank (24h window)
    this.homey.flow.getActionCard('get_current_hour_in_cheapest_24h')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const rank = device.getCapabilityValue('current_hour_in_cheapest_24h');
        return { rank };
      });

    // Get current hour cheapest rank (36h window)
    this.homey.flow.getActionCard('get_current_hour_in_cheapest_36h')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const rank = device.getCapabilityValue('current_hour_in_cheapest_36h');
        return { rank };
      });

    // Get current hour position (cheapest to expensive)
    this.homey.flow.getActionCard('get_hour_position_cheapest_to_expensive')
      .registerRunListener(async (args, state) => {
        const { device, window } = args;
        const hourWindow = parseInt(window);
        const result = device.calculateExactPricePosition(hourWindow, true);
        return {
          position: result.position,
          total_hours: result.totalHours
        };
      });

    // Get current hour position (expensive to cheapest)
    this.homey.flow.getActionCard('get_hour_position_expensive_to_cheapest')
      .registerRunListener(async (args, state) => {
        const { device, window } = args;
        const hourWindow = parseInt(window);
        const result = device.calculateExactPricePosition(hourWindow, false);
        return {
          position: result.position,
          total_hours: result.totalHours
        };
      });

    // Get current hour price position (new tied ranking action)
    this.homey.flow.getActionCard('get_current_hour_price_position')
      .registerRunListener(async (args, state) => {
        const { device, window } = args;
        const hourWindow = parseInt(window);
        const position = await device.calculateTiedPricePosition(hourWindow);
        return {
          position: position
        };
      });

    // Refresh price data action
    this.homey.flow.getActionCard('refresh_price_data')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        return await device.onActionRefreshPriceData(args, state);
      });
  }

  /**
   * Register flow conditions
   */
  _registerFlowConditions() {
    // Is current price cheap
    this.homey.flow.getConditionCard('is_currently_cheap')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        return device.getCapabilityValue('currently_cheap');
      });

    // Is current price expensive
    this.homey.flow.getConditionCard('is_currently_expensive')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        return device.getCapabilityValue('currently_expensive');
      });

    // Is maximise period active
    this.homey.flow.getConditionCard('is_maximise_period_active')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        return device.getCapabilityValue('maximise_usage_now');
      });

    // Is minimise period active
    this.homey.flow.getConditionCard('is_minimise_period_active')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        return device.getCapabilityValue('minimise_usage_now');
      });

    // Is current hour among cheapest (8h window)
    this.homey.flow.getConditionCard('is_current_hour_in_cheapest')
      .registerRunListener(async (args, state) => {
        const { device, rank } = args;
        const currentRank = device.getCapabilityValue('current_hour_in_cheapest');

        switch(rank) {
          case 'any3': return currentRank > 0;
          case 'any2': return currentRank === 1 || currentRank === 2;
          case 'cheapest': return currentRank === 1;
          case 'second': return currentRank === 2;
          case 'third': return currentRank === 3;
          default: return false;
        }
      });

    // Is current hour among cheapest (4h window)
    this.homey.flow.getConditionCard('is_current_hour_in_cheapest_4h')
      .registerRunListener(async (args, state) => {
        const { device, rank } = args;
        const currentRank = device.getCapabilityValue('current_hour_in_cheapest_4h');

        switch(rank) {
          case 'any3': return currentRank > 0;
          case 'any2': return currentRank === 1 || currentRank === 2;
          case 'cheapest': return currentRank === 1;
          case 'second': return currentRank === 2;
          case 'third': return currentRank === 3;
          default: return false;
        }
      });

    // Is current hour among cheapest (12h window)
    this.homey.flow.getConditionCard('is_current_hour_in_cheapest_12h')
      .registerRunListener(async (args, state) => {
        const { device, rank } = args;
        const currentRank = device.getCapabilityValue('current_hour_in_cheapest_12h');

        switch(rank) {
          case 'any3': return currentRank > 0;
          case 'any2': return currentRank === 1 || currentRank === 2;
          case 'cheapest': return currentRank === 1;
          case 'second': return currentRank === 2;
          case 'third': return currentRank === 3;
          default: return false;
        }
      });

    // Is current hour among cheapest (24h window)
    this.homey.flow.getConditionCard('is_current_hour_in_cheapest_24h')
      .registerRunListener(async (args, state) => {
        const { device, rank } = args;
        const currentRank = device.getCapabilityValue('current_hour_in_cheapest_24h');

        switch(rank) {
          case 'any3': return currentRank > 0;
          case 'any2': return currentRank === 1 || currentRank === 2;
          case 'cheapest': return currentRank === 1;
          case 'second': return currentRank === 2;
          case 'third': return currentRank === 3;
          default: return false;
        }
      });

    // Is current hour among cheapest (36h window)
    this.homey.flow.getConditionCard('is_current_hour_in_cheapest_36h')
      .registerRunListener(async (args, state) => {
        const { device, rank } = args;
        const currentRank = device.getCapabilityValue('current_hour_in_cheapest_36h');

        switch(rank) {
          case 'any3': return currentRank > 0;
          case 'any2': return currentRank === 1 || currentRank === 2;
          case 'cheapest': return currentRank === 1;
          case 'second': return currentRank === 2;
          case 'third': return currentRank === 3;
          default: return false;
        }
      });

    // Current price comparison
    this.homey.flow.getConditionCard('current_price_compare')
      .registerRunListener(async (args, state) => {
        const currentPrice = args.device.getCapabilityValue('current_hour_price');
        const compareValue = parseFloat(args.value);

        switch(args.operator) {
          case 'gt': return currentPrice > compareValue;
          case 'lt': return currentPrice < compareValue;
          case 'eq': return Math.abs(currentPrice - compareValue) < 0.0001;
          default: throw new Error('Invalid operator');
        }
      });

    // Current price compared to daily average
    this.homey.flow.getConditionCard('current_price_compare_to_daily_avg')
      .registerRunListener(async (args, state) => {
        const currentPrice = args.device.getCapabilityValue('current_hour_price');
        const dailyAvgPrice = args.device.getCapabilityValue('daily_average_price');

        switch(args.operator) {
          case 'gt': return currentPrice > dailyAvgPrice;
          case 'lt': return currentPrice < dailyAvgPrice;
          case 'eq': return Math.abs(currentPrice - dailyAvgPrice) < 0.0001;
          default: throw new Error('Invalid operator');
        }
      });

    // Current hour position (cheapest to expensive)
    this.homey.flow.getConditionCard('hour_position_cheapest_to_expensive')
      .registerRunListener(async (args, state) => {
        const { device, operator, position, window } = args;
        const hourWindow = parseInt(window);
        const targetPosition = parseInt(position);
        const result = device.calculateExactPricePosition(hourWindow, true);

        switch(operator) {
          case 'eq': return result.position === targetPosition;
          case 'lte': return result.position <= targetPosition;
          case 'gte': return result.position >= targetPosition;
          case 'lt': return result.position < targetPosition;
          case 'gt': return result.position > targetPosition;
          default: throw new Error('Invalid operator');
        }
      });
      
    // Current hour position (expensive to cheapest)
    this.homey.flow.getConditionCard('hour_position_expensive_to_cheapest')
      .registerRunListener(async (args, state) => {
        const { device, operator, position, window } = args;
        const hourWindow = parseInt(window);
        const targetPosition = parseInt(position);
        const result = device.calculateExactPricePosition(hourWindow, false);
        
        switch(operator) {
          case 'eq': return result.position === targetPosition;
          case 'lte': return result.position <= targetPosition;
          case 'gte': return result.position >= targetPosition;
          case 'lt': return result.position < targetPosition;
          case 'gt': return result.position > targetPosition;
          default: throw new Error('Invalid operator');
        }
      });

    // Current hour price position vs threshold (new tied ranking condition)
    this.homey.flow.getConditionCard('current_hour_price_position_vs_threshold')
      .registerRunListener(async (args, state) => {
        const { device, operator, threshold, window } = args;
        const hourWindow = parseInt(window);
        const thresholdValue = parseFloat(threshold);
        const position = await device.calculateTiedPricePosition(hourWindow);
        
        switch(operator) {
          case 'lte': return position <= thresholdValue;
          case 'lt': return position < thresholdValue;
          case 'eq': return Math.abs(position - thresholdValue) < 0.0001;
          case 'gte': return position >= thresholdValue;
          case 'gt': return position > thresholdValue;
          default: throw new Error('Invalid operator');
        }
      });
  }

  async updatePrices(retryCount = 0) {
    this.log("Triggering cache refresh for all devices");
    try {
      // Use the API orchestrator to refresh cache and update all devices
      await this.apiOrchestrator.refreshAllDevices();
    } catch (error) {
      this.error("Error updating prices via cache:", error);

      // Retry logic - maximum 3 retries with exponential backoff
      if (retryCount < 3) {
        const retryDelay = 5000 * Math.pow(2, retryCount); // 5s, 10s, 20s
        this.log(
          `Scheduling retry #${retryCount + 1} in ${retryDelay / 1000} seconds`,
        );

        setTimeout(() => {
          this.log(`Retrying cache refresh (attempt ${retryCount + 1})`);
          this.updatePrices(retryCount + 1);
        }, retryDelay);
      } else {
        this.error("Max retries reached, giving up with cache refresh");
      }
    }
  }

/**
   * Register flow triggers
   */
  _registerFlowTriggers() {
    // Current hour price position changed trigger
    this.homey.flow.getTriggerCard('current_hour_price_position_changed')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const position = device.getCapabilityValue('current_hour_price_position');
        
        // Calculate total tiers and window size for tokens
        const totalTiers = 12; // Approximate based on capability range
        const windowSize = 24; // Default window for the capability
        
        return {
          position: position,
          total_tiers: totalTiers,
          window_size: windowSize
        };
      });
  }

  /**
   * onDeleted is called when the driver is deleted
   */
  async onDeleted() {
    this.log("Pstryk price driver has been deleted");

    // Clear the cache check interval
    if (this._cacheCheckInterval) {
      this.homey.clearInterval(this._cacheCheckInterval);
    }

    // Clear the refresh timeout
    if (this._refreshTimeout) {
      this.homey.clearTimeout(this._refreshTimeout);
    }
  }

  /**
   * onPairListDevices is called when a user is adding a device
   */
  async onPairListDevices() {
    return [
      {
        name: "PSTRYK Prices",
        data: {
          id: "pstryk-api",
        },
        settings: {
          apiKey: "",
        },
      },
    ];
  }
};
