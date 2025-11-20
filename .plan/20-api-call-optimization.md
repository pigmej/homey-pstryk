# API Call Optimization - Implementation Plan

## Implementation Overview

This implementation will transform the current hourly API call pattern into a sophisticated caching system that reduces API calls by 96% while maintaining all existing functionality. The solution involves creating a driver-level shared cache, implementing intelligent cache invalidation, and replacing hourly API calls with internal state management.

### Key Changes Summary
- **API Call Reduction**: From ~24/day/device to 1/day/device
- **Cache Architecture**: Driver-level singleton cache shared across all devices
- **Internal Updates**: Hour boundary detection replaces hourly API calls
- **Smart Refresh**: Cache invalidation based on date changes and refresh hour
- **Consolidated Requests**: Single API call for all price data

## Component Details

### 1. Driver-Level Cache Manager

**Location**: `drivers/pstryk_price/driver.js`

**Purpose**: Centralized cache management shared across all devices

**Key Components**:
```javascript
class PriceDataCache {
  constructor() {
    this.currentPrices = [];
    this.dailyAverage = null;
    this.lastUpdated = null;
    this.expiresAt = null;
    this.date = null;
    this.isValid = false;
  }
  
  isCacheValid() { /* Check date and expiration */ }
  invalidateCache() { /* Clear cache data */ }
  updateCache(data) { /* Update with fresh data */ }
  getCachedData() { /* Return cached price data */ }
}

class APIOrchestrator {
  constructor(driver) {
    this.cache = new PriceDataCache();
    this.isRefreshing = false;
  }
  
  async shouldRefresh() { /* Determine if API call needed */ }
  async fetchFreshData() { /* Single consolidated API call */ }
  async refreshAllDevices() { /* Notify all devices of cache update */ }
}
```

### 2. Device-Level State Manager

**Location**: `drivers/pstryk_price/device.js`

**Purpose**: Internal state management without API calls

**Key Components**:
```javascript
class InternalStateUpdater {
  constructor(device) {
    this.lastHour = null;
    this.updateInterval = null;
  }
  
  detectHourBoundary() { /* Check if hour changed */ }
  async updateCurrentHourCapabilities() { /* Update capabilities from cache */ }
  async updatePeriodCapabilities() { /* Update usage periods from cache */ }
  startHourBoundaryDetection() { /* Start internal timer */ }
  stopHourBoundaryDetection() { /* Clean up timers */ }
}
```

### 3. Cache Event System

**Purpose**: Communication between driver cache and devices

**Implementation**:
- Driver emits 'cache-updated' events when cache refreshes
- Devices listen for cache updates and refresh their capabilities
- Event-driven architecture ensures all devices stay synchronized

## Data Structures

### PriceDataCache Structure
```javascript
{
  currentPrices: [
    {
      start: "2025-01-15T14:00:00Z",
      end: "2025-01-15T15:00:00Z", 
      price_gross: 0.4521,
      is_cheap: false,
      is_expensive: true
    }
    // ... 48 hours of data
  ],
  dailyAverage: 0.3876,
  lastUpdated: 1642252800000,
  expiresAt: 1642339200000,
  date: "2025-01-15",
  isValid: true
}
```

### Cache Validation Logic
```javascript
isCacheValid() {
  const now = new Date();
  const currentDate = now.toLocaleDateString("en-CA");
  
  // Invalid if date changed
  if (this.date !== currentDate) return false;
  
  // Invalid if expired
  if (now.getTime() > this.expiresAt) return false;
  
  // Invalid if no data
  if (!this.currentPrices.length) return false;
  
  return true;
}
```

## API Design

### Consolidated API Call Strategy

**Current Pattern** (Multiple calls):
```javascript
// Current implementation - multiple API calls
const currentPrices = await this.apiRequest("/integrations/pricing/", { resolution: "hour", ... });
const dailyAverage = await this.apiRequest("/integrations/pricing/", { resolution: "day", ... });
```

**Optimized Pattern** (Single call):
```javascript
// Optimized implementation - single API call
const response = await this.apiRequest("/integrations/pricing/", {
  resolution: "hour",
  window_start: windowStart.toISOString(),
  window_end: windowEnd.toISOString(),
  include_daily_average: true  // Request daily average in same call
});

// Extract both current prices and daily average from single response
const currentPrices = response.frames;
const dailyAverage = response.daily_average || this.calculateDailyAverage(response.frames);
```

### Smart Refresh Logic
```javascript
async shouldRefresh() {
  // Don't refresh if already refreshing
  if (this.isRefreshing) return false;
  
  // Refresh if cache invalid
  if (!this.cache.isCacheValid()) return true;
  
  // Refresh if manual request
  if (this.manualRefreshRequested) return true;
  
  return false;
}
```

## Testing Strategy

### Unit Testing

**Cache Manager Tests**:
- Cache validity on date changes
- Cache expiration at refresh hour
- Cache update and retrieval operations
- Concurrent access handling

**State Manager Tests**:
- Hour boundary detection accuracy
- Capability updates from cached data
- Timer management and cleanup

**API Orchestrator Tests**:
- Request deduplication
- Error handling and retry logic
- Cache invalidation triggers

### Integration Testing

**Multi-Device Scenarios**:
- Multiple devices sharing single cache
- Cache updates propagating to all devices
- Device addition/removal handling

**Flow Integration Tests**:
- All flow triggers work with cached data
- Flow actions return correct values from cache
- Flow conditions evaluate properly with cached data

### Performance Testing

**API Call Reduction**:
- Measure API calls before/after optimization
- Verify 96% reduction in API calls
- Test with multiple devices

**Response Time**:
- Capability updates from cache vs API calls
- Hour boundary detection performance
- Cache lookup performance

### Edge Case Testing

**Cache Failure Scenarios**:
- API unavailable during cache refresh
- Corrupted cache data handling
- Cache expiration during device operations

**Time Boundary Scenarios**:
- Daylight saving time transitions
- Midnight date changes
- Refresh hour edge cases

## Development Phases

### Phase 1: Driver-Level Cache Infrastructure
**Duration**: 2-3 days

**Tasks**:
1. Create `PriceDataCache` class in driver.js
2. Implement `APIOrchestrator` with singleton pattern
3. Add cache validation logic
4. Implement consolidated API call method
5. Add event emission for cache updates

**Deliverables**:
- Functional driver-level cache
- Single API call for price data
- Cache validation and expiration logic

### Phase 2: Device Refactoring
**Duration**: 2-3 days

**Tasks**:
1. Remove `setupHourlyCheck()` function
2. Create `InternalStateUpdater` class
3. Implement hour boundary detection
4. Refactor `updatePrices()` to use cache
5. Add cache update event listeners

**Deliverables**:
- Devices using cached data instead of API calls
- Internal hour boundary detection
- Event-driven capability updates

### Phase 3: API Call Optimization
**Duration**: 1-2 days

**Tasks**:
1. Implement request deduplication
2. Add smart refresh logic
3. Optimize error handling
4. Add retry mechanisms
5. Implement manual refresh functionality

**Deliverables**:
- Eliminated duplicate API calls
- Intelligent refresh triggers
- Robust error handling

### Phase 4: Internal State Management
**Duration**: 2-3 days

**Tasks**:
1. Implement capability updates without API calls
2. Add hour boundary detection for all capabilities
3. Ensure flow triggers work with cached data
4. Add cache status indicators
5. Optimize performance

**Deliverables**:
- Full functionality with cached data
- Hour-based internal updates
- Debugging and monitoring capabilities

### Phase 5: Testing and Validation
**Duration**: 2-3 days

**Tasks**:
1. Comprehensive unit testing
2. Integration testing with multiple devices
3. Flow system testing
4. Performance validation
5. Edge case handling verification

**Deliverables**:
- Complete test coverage
- Performance benchmarks
- Validation of 96% API call reduction

## Implementation Notes

### Critical Success Factors

**IMPORTANT**: Maintain backward compatibility
- All existing device settings must continue working
- No breaking changes to capability APIs
- Preserve all flow trigger/action/condition functionality

**IMPORTANT**: Ensure data consistency
- All devices must see identical cached data
- Cache updates must be atomic
- Handle concurrent access safely

**IMPORTANT**: Graceful degradation
- Functionality must work when API is unavailable
- Fallback to stale cache data if needed
- Clear error messaging for users

### Performance Considerations

**Memory Usage**:
- Cache size: ~48 hours of hourly data (~200KB)
- Shared across all devices (minimal per-device overhead)
- Automatic cleanup of expired data

**Timer Efficiency**:
- Hour boundary detection: Check once per minute
- Cache expiration: Check on access
- Event system: Minimal overhead

**Network Optimization**:
- Single API call per day per driver
- Request deduplication prevents duplicate calls
- Intelligent retry with exponential backoff

### Migration Strategy

**Rollout Approach**:
1. Implement cache alongside existing system
2. Gradually migrate devices to use cache
3. Remove old hourly API call system
4. Monitor for issues during transition

**Rollback Plan**:
- Keep existing code as fallback
- Feature flag to enable/disable optimization
- Automatic rollback on critical errors

This implementation plan provides a comprehensive roadmap to achieve the 96% API call reduction while maintaining all existing functionality through intelligent caching and internal state management.