"use strict";

const Homey = require("homey");

class PstrykApp extends Homey.App {
  async onInit() {
    this.log("PSTRYK Electricity Prices app is running...");
    // API endpoints are now handled in api.js
  }

  async onUninit() {
    this.log('PSTRYK app is shutting down...');
  }
}

module.exports = PstrykApp;
