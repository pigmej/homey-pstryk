"use strict";

const Homey = require("homey");
const fetch = require("node-fetch");

module.exports = class PstrykMeterDevice extends Homey.Device {
  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log("PstrykMeterDevice has been initialized");

    // Get the device settings
    this.settings = this.getSettings();

    // Initialize the update interval
    this.updateInterval = this.settings.updateInterval * 1000 || 30000;
    this.phaseSelection = this.settings.phaseSelection || "0";

    // Initialize the meter data
    this.meterData = null;

    // Set up the update interval
    this.updateIntervalId = this.homey.setInterval(
      this.updateMeterData.bind(this),
      this.updateInterval,
    );

    // Initial update
    this.updateMeterData();
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log("PstrykMeterDevice has been added");
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log("PstrykMeterDevice settings were changed");

    // Update the settings
    this.settings = newSettings;

    // If the update interval changed, update the interval
    if (changedKeys.includes("updateInterval")) {
      this.updateInterval = newSettings.updateInterval * 1000;
      this.homey.clearInterval(this.updateIntervalId);
      this.updateIntervalId = this.homey.setInterval(
        this.updateMeterData.bind(this),
        this.updateInterval,
      );
      this.log(`Update interval changed to ${this.updateInterval}ms`);
    }

    // If the phase selection changed, update the meter data
    if (changedKeys.includes("phaseSelection")) {
      this.phaseSelection = newSettings.phaseSelection;
      this.log(`Phase selection changed to ${this.phaseSelection}`);
      await this.updateMeterData();
    }

    // If the IP address changed, update the meter data
    if (changedKeys.includes("ipAddress")) {
      this.log(`IP address changed to ${newSettings.ipAddress}`);
      await this.updateMeterData();
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log("PstrykMeterDevice was renamed");
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log("PstrykMeterDevice has been deleted");

    // Clear the update interval
    this.homey.clearInterval(this.updateIntervalId);
  }

  /**
   * Update the meter data from the PSTRYK API
   */
  async updateMeterData() {
    try {
      const ipAddress = this.settings.ipAddress;

      if (!ipAddress) {
        this.error("IP address not set");
        return;
      }

      // this.log(`Fetching meter data from ${ipAddress}`);

      // Fetch the meter data
      const response = await fetch(`http://${ipAddress}/state`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      this.meterData = data;

      // Process the meter data
      await this.processMeterData();
    } catch (error) {
      this.error(`Error updating meter data: ${error.message}`);
    }
  }

  /**
   * Process the meter data and update the capabilities
   */
  async processMeterData() {
    if (
      !this.meterData ||
      !this.meterData.multiSensor ||
      !this.meterData.multiSensor.sensors
    ) {
      this.error("Invalid meter data");
      return;
    }

    try {
      const sensors = this.meterData.multiSensor.sensors;
      const phaseId = parseInt(this.phaseSelection);

      // Find the relevant sensors for the selected phase
      const activePowerSensor = sensors.find(
        (s) => s.id === phaseId && s.type === "activePower",
      );
      const voltageSensor = sensors.find(
        (s) => s.id === phaseId && s.type === "voltage",
      );
      const currentSensor = sensors.find(
        (s) => s.id === phaseId && s.type === "current",
      );
      const frequencySensor = sensors.find(
        (s) => s.id === phaseId && s.type === "frequency",
      );

      // Update the capabilities if the sensors are found
      if (activePowerSensor) {
        const powerWatts = activePowerSensor.value; // Raw value is in Watts
        // const powerKw = powerWatts / 1000; // Convert to kW for Homey
        await this.setCapabilityValue("measure_power", powerWatts);
        // this.log(`Updated measure_power: (${powerWatts}W)`);
      }

      if (voltageSensor) {
        const voltage = voltageSensor.value / 10; // Value is in deci-volts (230.0V = 2300)
        await this.setCapabilityValue("measure_voltage", voltage);
        // this.log(`Updated measure_voltage: ${voltage}V`);
      }

      if (currentSensor) {
        const current = currentSensor.value / 1000; // Value is in milli-amps (1.344A = 1344)
        await this.setCapabilityValue("measure_current", current);
        // this.log(`Updated measure_current: ${current}A`);
      }

      if (frequencySensor) {
        const frequency = frequencySensor.value / 1000; // Value is in milli-Hz (49.94Hz = 49940)
        await this.setCapabilityValue("measure_frequency", frequency);
        // this.log(`Updated measure_frequency: ${frequency}Hz`);
      }
    } catch (error) {
      this.error(`Error processing meter data: ${error.message}`);
    }
  }
};
