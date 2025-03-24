const Homey = require('homey');

class PriceMonitorDevice extends Homey.Device {
  async onInit() {
    this.log('Price Monitor device initialized');
    await this.updatePrices();
  }

  async updatePrices() {
    try {
      const apiKey = this.getSetting('api_key');
      if (!apiKey) {
        this.log('API key not set');
        return;
      }

      // Get prices for next 24 hours and cheapest times
      const { currentPrice, cheapestHours } = await this.getCurrentPrice(apiKey);
      
      await this.setCapabilityValue('measure_price', currentPrice);
      
      // Set cheapest hours with fallbacks
      [0, 1, 2].forEach(index => {
        const value = cheapestHours[index] || this.homey.__('errors.na');
        this.setCapabilityValue(`cheapest_hour_${index + 1}`, value);
      });
      
      // Get historical prices (last 7 days)
      const historicalData = await this.getHistoricalPrices(apiKey);
      this.log('Historical data updated');

    } catch (error) {
      this.error('Error updating prices:', error);
    }
  }

  async getCurrentPrice(apiKey) {
    const now = new Date();
    const windowStart = new Date();
    windowStart.setUTCHours(0, 0, 0, 0); // Start of current day in UTC
    
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowStart.getDate() + 1); // Add 24 hours

    const response = await Homey.app.apiRequest('/integrations/pricing/', {
      resolution: 'hour',
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString()
    }, apiKey);

    const currentFrame = response.frames.find(frame => frame.is_live);
    const futureFrames = response.frames.filter(frame => 
      new Date(frame.start) > now && new Date(frame.start) <= windowEnd
    );

    // Get cheapest hours sorted by price
    const cheapestFrames = [...futureFrames]
      .sort((a, b) => a.price_gross - b.price_gross)
      .slice(0, 3);

    // Format to local time (HH:mm)
    const cheapestHours = cheapestFrames.map(frame => {
      return new Date(frame.start).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    });

    return {
      currentPrice: currentFrame?.price_gross || 0,
      cheapestHours
    };
  }

  async getHistoricalPrices(apiKey) {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - 7);
    
    const response = await Homey.app.apiRequest('/integrations/pricing/', {
      resolution: 'day',
      window_start: windowStart.toISOString(),
      window_end: now.toISOString()
    }, apiKey);

    return response.frames.map(frame => ({
      timestamp: new Date(frame.start).getTime(),
      price: frame.price_gross_avg
    }));
  }

  onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('api_key')) {
      this.log('API key changed, updating prices');
      this.updatePrices();
    }
    return Promise.resolve();
  }
}

module.exports = PriceMonitorDevice;
