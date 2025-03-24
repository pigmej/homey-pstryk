const Homey = require('homey');

class PriceMonitorDriver extends Homey.Driver {
  async onInit() {
    this.log('PSTRYK Electricity Price Monitor driver initialized');
    
    // Update immediately and every hour + at 12:00 UTC (14:00 CEST)
    this._updatePricesInterval = setInterval(() => {
      const now = new Date();
      
      // Force update at 12:00 UTC (14:00 CEST)
      if (now.getUTCHours() === 12 && now.getUTCMinutes() === 0) {
        this.log('Triggering scheduled price update');
        this.updatePrices();
      }
      
      // Regular hourly update
      this.updatePrices();
    }, 3600 * 1000);

    // Initial update
    this.updatePrices();
  }

  async updatePrices() {
    try {
      const devices = this.getDevices();
      for (const device of devices) {
        await device.updatePrices();
      }
    } catch (error) {
      this.error('Error updating prices:', error);
    }
  }

  async onPairListDevices() {
    return [
      {
        name: 'Electricity Prices',
        data: {
          id: 'pstryk-price-monitor'
        },
        settings: {
          // This will now use the value entered in the settings step
          api_key: this.homey.settings.get('api_key') || ''
        }
      }
    ];
  }
}

module.exports = PriceMonitorDriver;
