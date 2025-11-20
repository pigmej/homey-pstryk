# API Call Optimization

## Problem Statement

The current implementation makes unnecessary API calls every hour despite electricity prices only changing once per day. The code currently:
- Calls API every hour via setupHourlyCheck() function
- Uses 5-minute cache which is too short for daily-changing data  
- Makes multiple API endpoints per update (current prices + daily average)
- Has no shared cache between devices

This results in ~24 API calls per day per device when only 1 is actually needed.

## Requirements

1. **Eliminate hourly API calls**: Remove setupHourlyCheck() and replace with internal hour boundary detection
2. **Implement daily caching**: Cache price data until next refresh hour (default 15:00)
3. **Add driver-level cache**: Share price data across all devices to avoid duplicate API calls
4. **Consolidate API calls**: Combine current price and daily average requests where possible
5. **Maintain functionality**: All current capabilities must work without API calls between refreshes
6. **Smart refresh logic**: Only call API when cache expires, date changes, or manual refresh requested

## Expected Outcome

1. **Reduced API calls**: From ~24/day to 1/day per device (96% reduction)
2. **Driver-level cache**: Shared price data structure accessible by all devices
3. **Internal updates**: Hour-based capability updates without API calls
4. **Improved performance**: Faster response times for internal state changes
5. **Better resilience**: Reduced dependency on API availability

## Additional Suggestions

- Use date-based cache validation (invalidate when date changes)
- Implement hour boundary detection to trigger internal capability updates
- Consider adding cache status indicator for debugging
- Maintain fallback logic for API failures
- Add configuration option for refresh hour if not already present

## Other Important Agreements

- User wants to "limit the API calling" and "switch fully internally"
- Prices "are changing once per day, once they're there they will never change"
- Current hourly checking "makes no sense" 
- Need to maintain all existing functionality while reducing API dependency
- Focus on intelligent caching rather than just reducing call frequency