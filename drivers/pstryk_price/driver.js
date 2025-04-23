"use strict";

const Homey = require("homey");

module.exports = class PstrykPriceDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("Pstryk price driver has been initialized");

    // Initial update for all devices
    setTimeout(this.updatePrices.bind(this), 2000);
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
