# Add Manual Refresh Flow Action

## Problem Statement

The current API optimization implementation successfully reduces API calls by 96% and provides intelligent caching, but lacks user-facing manual refresh capability. Users can only force refresh by changing their API key (inconvenient) or waiting for scheduled refresh (once per day). When users suspect data is stale, encounter error states, or want to test new API keys, they need a way to manually trigger price data refresh.

## Requirements

1. **Add flow action**: Create "Refresh price data" flow action that allows users to manually trigger cache refresh
2. **Maintain existing mechanisms**: Keep current programmatic refresh triggers (API key change, cache expiry)
3. **Proper error handling**: Ensure manual refresh follows same error handling and graceful degradation as automatic refresh
4. **User feedback**: Provide clear indication when manual refresh is triggered and its result
5. **Rate limiting**: Prevent excessive manual refresh requests to avoid API abuse

## Expected Outcome

1. **New flow action**: "Refresh price data" available in Homey flow editor
2. **Manual refresh capability**: Users can trigger refresh via flows (e.g., button press, schedule, automation)
3. **Consistent behavior**: Manual refresh uses same API orchestrator and caching logic as automatic refresh
4. **Error handling**: Manual refresh failures show same error states and fallback to stale cache
5. **User control**: Users can refresh when needed without changing API key or waiting for schedule

## Additional Suggestions

- Consider adding a refresh button capability in device UI for direct manual refresh
- Add refresh status indicator to show when refresh is in progress
- Implement cooldown period (e.g., 5 minutes) between manual refreshes to prevent API spam
- Add flow trigger for "refresh completed" to allow automation based on successful refreshes
- Consider adding refresh history or last refresh timestamp capability

## Other Important Agreements

- User specifically requested: "let's add flow action" for manual refresh capability
- Current implementation already has requestManualRefresh() method in API orchestrator but no user-facing way to call it
- Need to maintain the 96% API call reduction achievement while adding user control
- Manual refresh should integrate with existing cache infrastructure and error handling
- Focus on flow action rather than UI changes for maximum flexibility