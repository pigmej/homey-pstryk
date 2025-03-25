"use strict";

const Homey = require("homey");

module.exports = class PstrykPriceDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("Pstryk price driver has been initialized");

    this._updatePricesInterval = setInterval(
      () => {
        // Regular hourly update
        this.updatePrices();
      },
      30 * 60 * 1000,
    );

    // Initial update
    this.updatePrices();
  }

  async updatePrices() {
    this.log("Trying to update prices");
    try {
      const devices = this.getDevices();
      for (const device of devices) {
        await device.updatePrices();
      }
    } catch (error) {
      this.error("Error updating prices:", error);
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
        name: "PSTRYK API",
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
