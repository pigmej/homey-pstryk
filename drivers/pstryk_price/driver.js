"use strict";

const Homey = require("homey");

module.exports = class PstrykPriceDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("Pstryk price driver has been initialized");

    // Register flow conditions
    this._registerFlowConditions();

    // Register flow actions
    this._registerFlowActions();

    // Register flow triggers
    this._registerFlowTriggers();

    // Initial update for all devices
    setTimeout(this.updatePrices.bind(this), 2000);
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
    this.log("Trying to update prices");
    try {
      const devices = this.getDevices();
      for (const device of devices) {
        await device.updatePrices();
      }
    } catch (error) {
      this.error("Error updating prices:", error);

      // Retry logic - maximum 3 retries with exponential backoff
      if (retryCount < 3) {
        const retryDelay = 5000 * Math.pow(2, retryCount); // 5s, 10s, 20s
        this.log(
          `Scheduling retry #${retryCount + 1} in ${retryDelay / 1000} seconds`,
        );

        setTimeout(() => {
          this.log(`Retrying update prices (attempt ${retryCount + 1})`);
          this.updatePrices(retryCount + 1);
        }, retryDelay);
      } else {
        this.error("Max retries reached, giving up with updatePrices");
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
