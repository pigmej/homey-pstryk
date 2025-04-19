"use strict";

const Homey = require("homey");
const fetch = require("node-fetch");

module.exports = class PstrykMeterDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("PstrykMeterDriver has been initialized");
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    this.log("Listing devices for pairing");

    // Return a default device that the user can configure
    return [
      {
        name: "PSTRYK Energy Meter",
        data: {
          id: "pstryk-meter2",
        },
        settings: {
          ipAddress: "",
          updateInterval: 1,
          phaseSelection: "0",
        },
      },
    ];
  }

  // /**
  //  * Test the connection to a PSTRYK meter
  //  * @param {string} ipAddress The IP address of the meter
  //  * @returns {Promise<boolean>} True if the connection is successful
  //  */
  // async testConnection(ipAddress) {
  //   try {
  //     this.log(`Testing connection to ${ipAddress}`);

  //     const response = await fetch(`http://${ipAddress}/state`, {
  //       method: "GET",
  //       headers: {
  //         "Content-Type": "application/json",
  //       },
  //       timeout: 5000, // 5 second timeout
  //     });

  //     if (!response.ok) {
  //       throw new Error(`HTTP error! status: ${response.status}`);
  //     }

  //     const data = await response.json();

  //     // Check if the response contains the expected data structure
  //     if (data && data.multiSensor && data.multiSensor.sensors) {
  //       this.log("Connection test successful");
  //       return true;
  //     } else {
  //       this.log("Connection test failed: Invalid response format");
  //       return false;
  //     }
  //   } catch (error) {
  //     this.error(`Connection test failed: ${error.message}`);
  //     return false;
  //   }
  // }
};
