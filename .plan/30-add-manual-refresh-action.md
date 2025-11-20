# Implementation Plan: Add Manual Refresh Flow Action

## Implementation Overview

Add a "Refresh price data" flow action to the pstryk_price driver that allows users to manually trigger cache refresh while maintaining existing API optimization and error handling mechanisms.

## Key Components to Implement

1. **Flow Action Definition**: Create new flow action JSON file in .homeycompose/flow/actions/
2. **Driver Method Implementation**: Add refresh action handler to pstryk_price/device.js
3. **Rate Limiting**: Implement cooldown mechanism to prevent API abuse
4. **Error Handling**: Ensure manual refresh follows existing error handling patterns
5. **User Feedback**: Provide clear indication of refresh status and results

## Critical Implementation Steps

1. **Create flow action definition**:
   - Add refresh_price_data.json to .homeycompose/flow/actions/
   - Define action title, description, and arguments
   - Set up proper Homey flow action schema

2. **Implement action handler in device.js**:
   - Add onActionRefreshPriceData method to pstryk_price/device.js
   - Call existing requestManualRefresh() method from API orchestrator
   - Implement rate limiting with cooldown period (5 minutes)

3. **Add rate limiting mechanism**:
   - Track last manual refresh timestamp
   - Reject requests within cooldown period
   - Provide appropriate error message for rate-limited requests

4. **Integrate with existing error handling**:
   - Use same error handling patterns as automatic refresh
   - Ensure graceful degradation on API failures
   - Maintain fallback to stale cache behavior

5. **Update driver flow composition**:
   - Register new action in driver.flow.compose.json
   - Ensure proper action discovery by Homey

## Testing Requirements

1. **Flow action creation**: Verify action appears in Homey flow editor
2. **Manual refresh execution**: Test refresh triggers and cache updates
3. **Rate limiting**: Verify cooldown period enforcement
4. **Error handling**: Test behavior with API failures and invalid states
5. **Integration**: Ensure manual refresh works alongside automatic refresh mechanisms

## Files to Modify

- .homeycompose/flow/actions/refresh_price_data.json (new)
- drivers/pstryk_price/device.js (add action handler)
- drivers/pstryk_price/driver.flow.compose.json (register action)

## Success Criteria

- Flow action "Refresh price data" appears in Homey editor
- Manual refresh successfully updates cache data
- Rate limiting prevents API abuse (5-minute cooldown)
- Error handling matches existing automatic refresh behavior
- No impact on existing 96% API call reduction achievement