"use strict";

const Homey = require("homey");
const { apiRequest } = require("./api");

class PstrykApp extends Homey.App {
  async onInit() {
    this.log("PSTRYK Electricity Prices app is running...");

    // Make API helper available to devices
    this.apiRequest = apiRequest;
  }
}

module.exports = PstrykApp;
