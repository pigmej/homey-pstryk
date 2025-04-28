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

    // Initial update for all devices
    setTimeout(this.updatePrices.bind(this), 2000);
  }
  
  /**
   * Register flow actions
   */
  _registerFlowActions() {
    // Get current hour cheapest rank
    this.homey.flow.getActionCard('get_current_hour_in_cheapest')
      .registerRunListener(async (args, state) => {
        const { device } = args;
        const rank = device.getCapabilityValue('current_hour_in_cheapest');
        return { rank };
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
      
    // Is current hour among cheapest
    this.homey.flow.getConditionCard('is_current_hour_in_cheapest')
      .registerRunListener(async (args, state) => {
        const { device, rank } = args;
        const currentRank = device.getCapabilityValue('current_hour_in_cheapest');
        
        switch(rank) {
          case 'any': return currentRank > 0;
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
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
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
