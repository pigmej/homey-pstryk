const Homey = require('homey');

module.exports = {
  async apiRequest(endpoint, params, apiKey) {
    const url = `https://api.pstryk.eu${endpoint}`;
    
    const response = await Homey.http({
      method: 'GET',
      url,
      query: params,
      headers: {
        Authorization: `Token ${apiKey}`
      },
      json: true
    });

    if (response.status !== 200) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.data;
  }
};
