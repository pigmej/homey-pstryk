# API Call Optimization - Architectural Analysis

## Context Analysis

The current Pstryk price driver implementation suffers from excessive API calls, making ~24 requests per day per device when electricity prices only change once per day. The key issues are:

1. **Hourly API calls**: `setupHourlyCheck()` function triggers API calls every hour
2. **Short cache duration**: 5-minute cache is inappropriate for daily-changing data
3. **Multiple API endpoints**: Separate calls for current prices and daily average
4. **No shared cache**: Each device maintains its own cache, leading to duplicate requests
5. **Inefficient refresh logic**: No intelligent cache invalidation based on actual data change patterns

The user wants to "limit the API calling" and "switch fully internally" while maintaining all existing functionality.

## Technology Recommendations

### **IMPORTANT: Cache Architecture**
- **Driver-level shared cache**: Implement a singleton cache pattern at the driver level to share data across all devices
- **Date-based cache validation**: Use date changes as primary cache invalidation trigger
- **Smart expiration**: Cache until next refresh hour (default 15:00) with manual refresh capability

### **IMPORTANT: API Call Consolidation**
- **Single endpoint strategy**: Combine current price and daily average requests into one API call where possible
- **Batch processing**: Fetch all required data in a single request to minimize API overhead
- **Conditional requests**: Only make API calls when cache is expired, date changes, or manual refresh is requested

### **IMPORTANT: Internal State Management**
- **Hour boundary detection**: Replace hourly API calls with internal time-based state updates
- **Event-driven updates**: Use internal timers to trigger capability updates without API calls
- **State persistence**: Maintain price data in memory for instant access between refreshes

## System Architecture

### **Cache Layer Architecture**
```
Driver Level (Shared Cache)
├── PriceDataCache
│   ├── currentPrices: Array<PriceFrame>
│   ├── dailyAverage: number
│   ├── lastUpdated: timestamp
│   ├── expiresAt: timestamp
│   └── date: string (YYYY-MM-DD)
├── CacheManager
│   ├── isCacheValid(): boolean
│   ├── invalidateCache(): void
│   ├── updateCache(data): void
│   └── getCachedData(): PriceData
└── APIOrchestrator
    ├── shouldRefresh(): boolean
    ├── fetchFreshData(): Promise<PriceData>
    └── refreshAllDevices(): void
```

### **Device Level Architecture**
```
Device Level (State Management)
├── InternalStateUpdater
│   ├── detectHourBoundary(): boolean
│   ├── updateCurrentHourCapabilities(): void
│   └── updatePeriodCapabilities(): void
├── CapabilityManager
│   ├── getCurrentPriceFromCache(): number
│   ├── calculateRankings(): void
│   └── updateAllCapabilities(): void
└── EventHandlers
    ├── onHourChange(): void
    ├── onManualRefresh(): void
    └── onCacheUpdate(): void
```

## Integration Patterns

### **IMPORTANT: Driver-Device Communication**
- **Observer pattern**: Devices observe driver-level cache changes
- **Event emission**: Driver emits cache update events to all registered devices
- **Shared state**: All devices read from the same cache instance
- **Synchronization**: Ensure thread-safe access to shared cache data

### **API Call Pattern**
- **Singleton API caller**: Only one device instance makes the actual API call
- **Request deduplication**: Prevent multiple simultaneous API calls
- **Error handling**: Centralized error handling with fallback to cached data
- **Retry logic**: Exponential backoff for failed API requests

### **Cache Invalidation Pattern**
- **Time-based**: Cache expires at configured refresh hour
- **Date-based**: Automatic invalidation when date changes
- **Manual**: User-triggered cache refresh
- **Event-based**: Cache updates trigger device state refreshes

## Implementation Guidance

### **Phase 1: Driver-Level Cache Implementation**
1. Create `PriceDataCache` class in driver.js
2. Implement singleton pattern for shared cache access
3. Add cache validation logic based on date and time
4. Move API calling logic to driver level

### **Phase 2: Device Refactoring**
1. Remove `setupHourlyCheck()` from device.js
2. Implement hour boundary detection using internal timers
3. Refactor `updatePrices()` to use cached data
4. Add event listeners for cache updates

### **Phase 3: API Optimization**
1. Consolidate API calls into single request method
2. Implement request deduplication
3. Add smart refresh logic (only when needed)
4. Optimize error handling and retry mechanisms

### **Phase 4: Internal State Management**
1. Implement capability updates without API calls
2. Add hour boundary detection for automatic updates
3. Ensure all existing functionality works with cached data
4. Add cache status indicators for debugging

### **Critical Implementation Notes**
- **IMPORTANT**: Maintain backward compatibility with existing device settings
- **IMPORTANT**: Preserve all current capability behaviors and flow triggers
- **IMPORTANT**: Ensure smooth transition from current hourly pattern to new cache-based pattern
- **IMPORTANT**: Add comprehensive logging for cache operations and API calls
- **IMPORTANT**: Implement graceful degradation when API is unavailable

### **Performance Considerations**
- Memory usage for cached price data (minimal impact)
- Timer frequency for hour boundary detection (low overhead)
- Event system overhead for cache updates (negligible)
- Reduced network traffic (96% reduction in API calls)

### **Testing Strategy**
- Verify cache invalidation on date changes
- Test hour boundary detection accuracy
- Validate capability updates without API calls
- Ensure flow triggers work with cached data
- Test manual refresh functionality
- Verify error handling and fallback behavior

This architecture will achieve the goal of reducing API calls by 96% while maintaining all existing functionality through intelligent caching and internal state management.