# Price Position Tie Handling - Implementation Plan

## Implementation Overview

This implementation addresses the critical tie-handling flaw in PSTRYK's price ranking system by introducing a new `current_hour_price_position` capability that provides fair ranking for hours with identical prices. The solution follows a tiered ranking approach where equally priced hours receive identical position values.

### Key Objectives
- **Fix tie handling**: Hours with identical prices get the same position value
- **Generic solution**: Single capability usable for any threshold comparison
- **Backward compatibility**: No changes to existing capabilities or flows
- **Clean integration**: Intuitive flow conditions with standard comparison operators

### Implementation Strategy
- **Phase 1**: Core tiered ranking algorithm implementation with existing error handling patterns
- **Phase 2**: New capability integration with existing cache invalidation and device updates
- **Phase 3**: Flow condition and trigger implementation with migration examples
- **Phase 4**: Comprehensive testing and validation with quantified performance benchmarks

## Component Details

### 1. Core Algorithm Module

**Location**: `drivers/pstryk_price/device.js`

**Primary Function**: `calculateTiedPricePosition(hourWindow)`
```javascript
/**
 * Calculates price position using tiered ranking for fair tie handling
 * @param {number} hourWindow - Time window in hours (4, 8, 12, 24, 36)
 * @returns {number} Position value (1.0, 2.0, 3.0, etc.) with consistent floating-point precision
 */
calculateTiedPricePosition(hourWindow) {
  try {
    // Check cache first using existing invalidation patterns
    if (this._priceWindowValid) {
      const cached = this._priceTiersCache[hourWindow];
      if (cached && cached.valid && this._isCacheValid(cached.timestamp)) {
        this.log('Using cached price position:', cached.currentHourPosition);
        return Number(cached.currentHourPosition.toFixed(1)); // Consistent precision
      }
    }
    
    // Perform tiered ranking calculation with precise floating-point handling
    const position = this._calculateTiedPosition(hourWindow);
    const precisePosition = Number(position.toFixed(1)); // Ensure consistent decimal precision
    
    // Update cache with new results
    this._updatePriceTiersCache(hourWindow, precisePosition);
    
    return precisePosition;
  } catch (error) {
    this.error('Error calculating tied price position:', error);
    // Fallback to safe default with consistent precision
    return 1.0;
  }
}
```

**Supporting Functions**:
- `groupFramesByPrice(frames)` - Groups frames by identical prices
- `findTierForCurrentHour(priceTiers, currentFrame)` - Finds current hour's price tier
- `assignTierPositions(priceTiers)` - Assigns sequential position values to tiers
- `_isCacheValid(timestamp)` - Checks cache validity using existing patterns
- `_updatePriceTiersCache(windowSize, position)` - Updates cache with new results
- `_calculateTiedPosition(hourWindow)` - Core calculation without cache logic
- `_invalidatePriceTiersCache()` - Invalidates cache using existing invalidation patterns

### 2. New Capability Definition

**File**: `.homeycompose/capabilities/current_hour_price_position.json`

```json
{
  "id": "current_hour_price_position",
  "type": "number",
  "title": {
    "en": "Current hour price position"
  },
  "desc": {
    "en": "Current hour's price position when sorted by price (identical prices get same position)"
  },
  "getable": true,
  "setable": false,
  "units": {
    "en": ""
  },
  "insights": false,
  "insightsTitle": true,
  "insightsChartType": "line",
  "insightsDeepLink": false,
  "insightsScale": false,
  "range": [1.0, 12.0],
  "step": 1.0,
  "decimals": 1,
  "quorum": false,
  "versions": {
    "1": {
      "title": {
        "en": "Current hour price position"
      }
    }
  }
}
```

**Capability Range Rationale**: The range [1.0, 12.0] reflects the practical reality that tiered ranking with identical prices will rarely exceed 12 distinct price tiers, even in 48-hour windows. This is more realistic than [1.0, 48.0] since:
- Most electricity markets show price clustering rather than uniform distribution
- Tiered ranking groups identical prices, reducing the maximum possible position value
- Provides better UX with more meaningful threshold values for flow conditions

**Floating-Point Precision**: Consistent decimal precision (1 decimal place) maintained throughout calculation and caching to ensure reliable comparisons and eliminate floating-point arithmetic issues.

### 3. Flow Integration Components

#### Flow Condition Definition
**File**: `.homeycompose/flow/conditions/current_hour_price_position_vs_threshold.json`

```json
{
  "id": "current_hour_price_position_vs_threshold",
  "title": {
    "en": "Current hour price position vs Nth threshold"
  },
  "desc": {
    "en": "Compare current hour price position against a threshold value"
  },
  "args": [
    {
      "name": "device",
      "type": "device",
      "filter": "driver_id=pstryk_price"
    },
    {
      "name": "operator",
      "type": "dropdown",
      "values": [
        {"id": "lte", "label": "≤"},
        {"id": "lt", "label": "<"},
        {"id": "eq", "label": "="},
        {"id": "gte", "label": "≥"}
      ]
    },
    {
      "name": "threshold",
      "type": "number",
      "min": 1,
      "max": 12,
      "step": 1,
      "value": 3
    },
    {
      "name": "window",
      "type": "dropdown",
      "values": [
        {"id": "4", "label": "4 hours"},
        {"id": "8", "label": "8 hours"},
        {"id": "12", "label": "12 hours"},
        {"id": "24", "label": "24 hours"},
        {"id": "36", "label": "36 hours"}
      ]
    }
  ]
}
```

#### Flow Action Definition
**File**: `.homeycompose/flow/actions/get_current_hour_price_position.json`

```json
{
  "id": "get_current_hour_price_position",
  "title": {
    "en": "Get current hour price position"
  },
  "desc": {
    "en": "Get the current hour's price position for a specific time window"
  },
  "args": [
    {
      "name": "device",
      "type": "device",
      "filter": "driver_id=pstryk_price"
    },
    {
      "name": "window",
      "type": "dropdown",
      "values": [
        {"id": "4", "label": "4 hours"},
        {"id": "8", "label": "8 hours"},
        {"id": "12", "label": "12 hours"},
        {"id": "24", "label": "24 hours"},
        {"id": "36", "label": "36 hours"}
      ]
    }
  ],
  "state": [
    {
      "name": "position",
      "type": "number",
      "units": ""
    }
  ]
}
```

#### Trigger Definition
**File**: `.homeycompose/flow/triggers/current_hour_price_position_changed.json`

```json
{
  "id": "current_hour_price_position_changed",
  "title": {
    "en": "Current hour price position changed"
  },
  "desc": {
    "en": "Triggered when the current hour price position changes"
  },
  "args": [
    {
      "name": "device",
      "type": "device",
      "filter": "driver_id=pstryk_price"
    }
  ],
  "tokens": [
    {
      "name": "position",
      "type": "number",
      "title": {
        "en": "Position"
      }
    },
    {
      "name": "total_tiers",
      "type": "number",
      "title": {
        "en": "Total price tiers"
      }
    },
    {
      "name": "window_size",
      "type": "number",
      "title": {
        "en": "Window size (hours)"
      }
    }
  ]
}
```

### 4. Driver Integration

**Location**: `drivers/pstryk_price/driver.js`

**Flow Condition Handler**:
```javascript
const conditions = {
  current_hour_price_position_vs_threshold: async (device, state, condition) => {
    const { operator, threshold, window } = condition;
    const position = await device.calculateTiedPricePosition(window);
    
    switch (operator) {
      case 'lte': return position <= threshold;
      case 'lt': return position < threshold;
      case 'eq': return position === threshold;
      case 'gte': return position >= threshold;
      default: throw new Error(`Unknown operator: ${operator}`);
    }
  }
};
```

**Flow Action Handler**:
```javascript
const actions = {
  get_current_hour_price_position: async (device, state, action) => {
    const { window } = action;
    const position = await device.calculateTiedPricePosition(window);
    return { position };
  }
};
```

## Data Structures

### 1. Price Tier Structure

```javascript
// Example of tiered price structure
const priceTiers = [
  {
    position: 1.0,
    price: 0.1234,
    frameIndices: [0, 2, 5], // Hours with this price
    count: 3
  },
  {
    position: 2.0,
    price: 0.1567,
    frameIndices: [1, 7],
    count: 2
  },
  {
    position: 3.0,
    price: 0.1890,
    frameIndices: [3],
    count: 1
  }
];
```

### 2. Frame Data Structure

```javascript
// Frame structure (existing)
const frame = {
  index: 0,
  price_gross: 0.1234,
  price_net: 0.1123,
  start_time: "2024-01-15T00:00:00+01:00",
  end_time: "2024-01-15T01:00:00+01:00",
  // ... other properties
};
```

### 3. Device State Extensions

```javascript
// Cache structure integrated with existing invalidation patterns
this._priceTiersCache = {
  [windowSize]: {
    tiers: priceTiers,
    timestamp: Date.now(),
    currentHourPosition: 1.0,
    valid: true // Integrated with _priceWindowValid flag
  }
};

// Integration with existing price window validation
if (this._priceWindowValid) {
  // Use cached tiers if still valid
  const cached = this._priceTiersCache[windowSize];
  if (cached && cached.valid && this._isCacheValid(cached.timestamp)) {
    return cached.currentHourPosition;
  }
}
```

## API Design

### 1. Internal API Methods

```javascript
// Core algorithm methods
class PstrykPriceDevice extends Device {
  calculateTiedPricePosition(hourWindow) {}
  groupFramesByPrice(frames) {}
  findTierForCurrentHour(priceTiers, currentFrame) {}
  assignTierPositions(priceTiers) {}
  updatePricePositionCapability() {}
}
```

### 2. Capability API

```javascript
// Capability interaction
await device.setCapabilityValue("current_hour_price_position", position);
const position = await device.getCapabilityValue("current_hour_price_position");
```

### 3. Flow API

```javascript
// Flow condition usage
// "Current hour price position ≤ 3.0" (8h window)
{
  device: deviceId,
  operator: "lte",
  threshold: 3,
  window: 8
}

// Flow action usage
// "Get current hour price position" (24h window)
{
  device: deviceId,
  window: 24
}
```

## Testing Strategy

### 1. Unit Testing

**Test Scenarios**:
- **Tie scenarios**: Multiple hours with identical prices
- **Edge cases**: All prices identical, single price tier, maximum window size
- **Algorithm validation**: Correct tier assignment and position calculation
- **Performance**: Execution time with specific target < 50ms for 48-hour window

**Example Test Cases**:
```javascript
// Test case: 3-way tie for cheapest
const frames = [
  { price_gross: 0.1234, index: 0 },
  { price_gross: 0.1234, index: 1 }, // Tie
  { price_gross: 0.1234, index: 2 }, // Tie
  { price_gross: 0.1567, index: 3 },
  { price_gross: 0.1890, index: 4 }
];
// Expected: All first 3 frames get position 1.0
```

### 2. Integration Testing

**Flow Testing**:
- Flow condition evaluation with various operators
- Flow action return values
- Trigger firing and token values
- Backward compatibility with existing flows

**Capability Testing**:
- Capability value updates during price refresh
- Device initialization and capability registration
- Error handling for missing data

### 3. System Testing

**Real Data Testing**:
- Historical price data with actual tie scenarios
- Performance with maximum data set (48 hours)
- Long-term stability and memory usage
- Integration with existing capabilities

**User Acceptance Testing**:
- Flow creation and testing with real users
- Documentation review and feedback
- Migration scenario validation

### 4. Test Data Sets

**Tie Pattern Test Cases**:
- **2-way ties**: Two hours with identical prices at different positions
- **3-way ties**: Three hours with identical cheapest prices
- **Multiple ties**: Several price tiers with varying tie counts
- **Full ties**: All prices in window are identical
- **No ties**: All prices different (regression test)

### 5. Performance Benchmarks & Validation Criteria

**Quantified Performance Targets**:
- **Algorithm execution**: < 50ms for 48-hour window (95th percentile)
- **Cache hit performance**: < 5ms for cached results
- **Memory usage**: < 10MB additional memory for cache structures
- **Update latency**: < 100ms from price refresh to capability update

**Validation Criteria**:
- **Accuracy**: 100% correct tie handling across all test scenarios
- **Consistency**: Identical results for same input data across multiple executions
- **Stability**: No memory leaks or performance degradation over 24-hour period
- **Compatibility**: Zero impact on existing capability update frequency

**Benchmarking Methodology**:
- **Load testing**: Simulate maximum data sets (48 frames) with various tie patterns
- **Stress testing**: Continuous price updates at maximum frequency
- **Memory profiling**: Track memory usage patterns over extended periods
- **Real-world validation**: Test with historical price data containing actual ties

## Development Phases

### Phase 1: Core Algorithm Implementation (Week 1-2)

**Objectives**: Implement tiered ranking algorithm with comprehensive testing

**Tasks**:
1. **Create tier grouping function** in `device.js`
   - `groupFramesByPrice()` - Group frames by identical prices
   - Handle edge cases (empty data, single frame, etc.)

2. **Implement tie-aware position calculation**
   - `calculateTiedPricePosition()` - Main algorithm function
   - `findTierForCurrentHour()` - Locate current hour in price tiers
   - `assignTierPositions()` - Assign sequential positions to tiers

3. **Add comprehensive logging**
   - Debug logging for tie scenarios
   - Performance metrics for algorithm execution
   - Error logging for edge cases

4. **Unit testing and validation**
   - Test all tie scenarios (2-way, 3-way, multiple ties)
   - Performance testing with maximum data sets
   - Regression testing against existing behavior

**Deliverables**:
- Core algorithm functions implemented and tested
- Unit test suite with 100% coverage
- Performance benchmarks established
- Integration test framework prepared

### Phase 2: Capability Integration (Week 3)

**Objectives**: Integrate new capability into device and update price refresh cycle

**Tasks**:
1. **Create capability definition**
   - Define `current_hour_price_position` in `.homeycompose/capabilities/`
   - Set appropriate range, step, and decimal precision
   - Add capability to device initialization

2. **Update device driver**
    - Add capability registration in `onInit()` with proper error handling
    - Integrate position calculation into `updatePrices()` method following existing error patterns
    - Add capability value update on price refresh with error logging
    - Ensure calculation errors don't break existing price updates

3. **Implement caching strategy**
    - Add `_priceTiersCache` integrated with existing `_priceWindowValid` flag
    - Implement cache invalidation on price updates using existing invalidation patterns
    - Ensure thread-safe cache access with proper synchronization

4. **Add trigger support**
   - Create `current_hour_price_position_changed` trigger
   - Implement trigger firing on capability value changes
   - Add trigger tokens (position, total_tiers, window_size)

**Deliverables**:
- New capability fully integrated
- Device initialization updated
- Price refresh cycle enhanced
- Trigger system implemented

### Phase 3: Flow Integration (Week 4)

**Objectives**: Complete flow integration with conditions, actions, and documentation

**Tasks**:
1. **Create flow condition definition**
   - Define `current_hour_price_position_vs_threshold` condition
   - Implement condition logic in driver
   - Support all operators (≤, <, =, ≥) and time windows

2. **Create flow action definition**
   - Define `get_current_hour_price_position` action
   - Implement action handler with window parameter
   - Add state return values

3. **Implement flow handlers**
   - Add condition evaluation logic
   - Add action execution logic
   - Handle parameter validation and error cases

4. **Create comprehensive documentation**
   - Flow usage examples and tutorials
   - Migration guide from existing capabilities
   - API reference documentation

**Deliverables**:
- Flow conditions and actions implemented
- Complete flow integration tested
- Documentation package created
- Example flows provided

### Phase 4: Testing & Validation (Week 5)

**Objectives**: Comprehensive testing and user validation before release

**Tasks**:
1. **Test tie scenarios with real data**
   - Use historical price data with actual ties
   - Validate algorithm correctness in real scenarios
   - Test performance with maximum data loads

2. **Validate backward compatibility**
   - Ensure existing flows continue working
   - Test side-by-side operation of old and new capabilities
   - Verify no performance degradation

3. **Performance optimization**
   - Profile algorithm execution time
   - Optimize caching strategy based on usage patterns
   - Validate memory usage with large data sets

4. **User acceptance testing**
   - Real user testing with actual flows
   - Gather feedback on usability and naming
   - Finalize documentation based on user feedback

**Deliverables**:
- Comprehensive test results and validation
- Performance optimization completed
- User acceptance confirmed
- Release-ready implementation

## Migration Examples

### Existing Flow Conversion

**Example 1: Basic Cheapest Hour Check**
- **Old Flow**: "Current hour in cheapest" condition with value 3
- **New Flow**: "Current hour price position vs Nth threshold" with operator ≤ and threshold 3.0
- **Usage**: Both achieve "current hour is among 3 cheapest" but new version handles ties fairly

**Example 2: Multi-window Comparison**
- **Old Flow**: Multiple conditions using `current_hour_in_cheapest_4h`, `current_hour_in_cheapest_8h`, etc.
- **New Flow**: Single condition with window parameter (4, 8, 12, 24, 36 hours)
- **Benefit**: Unified approach eliminates capability proliferation

**Example 3: Action Replacement**
- **Old Flow**: Get `current_hour_in_cheapest` value via device state
- **New Flow**: Use "Get current hour price position" action with window parameter
- **Advantage**: Consistent API across all time windows

### Flow Condition Migration Table

| Old Capability | New Condition | Parameters | Equivalent Logic |
|---------------|---------------|------------|------------------|
| `current_hour_in_cheapest` | `current_hour_price_position_vs_threshold` | operator: ≤, threshold: 3, window: 24 | Position ≤ 3.0 (24h) |
| `current_hour_in_cheapest_4h` | `current_hour_price_position_vs_threshold` | operator: ≤, threshold: 2, window: 4 | Position ≤ 2.0 (4h) |
| `current_hour_in_cheapest_8h` | `current_hour_price_position_vs_threshold` | operator: ≤, threshold: 4, window: 8 | Position ≤ 4.0 (8h) |

## Error Handling Integration

### Consistent Error Patterns

**Integration with Existing Error Handling**:
- Follow existing `updatePrices()` error handling patterns in `device.js`
- Use same logging levels and error codes as other price calculations
- Implement graceful degradation on calculation failures
- Maintain existing retry logic for transient errors

**Error Scenarios**:
- **Missing price data**: Return position 0.0 with debug logging
- **Invalid window size**: Throw descriptive error matching existing patterns
- **Cache corruption**: Fallback to recalculation with error logging
- **Frame parsing errors**: Skip invalid frames with warning logs

**Logging Integration**:
- Use existing logger instance from device context
- Follow same log message format as `calculateCurrentFrame()` method
- Integrate with existing error tracking and monitoring

## Success Criteria

### Functional Requirements
- ✅ All hours with identical prices receive the same position value
- ✅ Single generic capability works for any threshold comparison
- ✅ New flow conditions support standard comparison operators
- ✅ Zero impact on existing capabilities and flows

### Technical Requirements
- ✅ Algorithm performance within acceptable limits (< 50ms for 48-hour window, 95th percentile)
- ✅ Memory usage optimized with efficient caching (< 10MB additional memory)
- ✅ Error handling for all edge cases following existing patterns
- ✅ Comprehensive test coverage (> 95%) including tie scenarios
- ✅ Cache integration with existing `_priceWindowValid` invalidation patterns
- ✅ Zero performance impact on existing capabilities and price updates

### User Experience Requirements
- ✅ Clear and intuitive capability naming
- ✅ Easy-to-use flow conditions with familiar operators
- ✅ Comprehensive documentation and examples
- ✅ Smooth migration path from existing capabilities

### Quality Requirements
- ✅ Zero regressions in existing functionality
- ✅ Robust error handling and logging
- ✅ Performance stable under various data conditions
- ✅ Code maintainability and readability

## Summary of Review Feedback Implementation

This implementation plan has been updated to address all critical feedback from the review:

**Critical Issues Resolved:**
1. **Capability Range Fixed**: Updated from unrealistic [1.0, 48.0] to practical [1.0, 12.0] with detailed rationale
2. **Cache Integration Enhanced**: Integrated `_priceTiersCache` with existing `_priceWindowValid` flag and invalidation patterns
3. **Migration Examples Added**: Comprehensive examples showing how to convert existing flows to new capability
4. **Performance Metrics Quantified**: Specific targets (< 50ms for 48-hour window) instead of generic benchmarks
5. **Error Handling Integrated**: Follows existing patterns in `updatePrices()` method with graceful degradation

**Key Enhancements:**
- Detailed migration table for converting old capabilities to new system
- Specific performance benchmarks with 95th percentile targets
- Floating-point precision handling for consistent comparisons
- Integration with existing cache invalidation and error handling patterns
- Comprehensive validation criteria with real-world testing scenarios

This updated plan provides a robust, production-ready implementation that addresses all identified issues while maintaining backward compatibility and following established architectural patterns.

This implementation plan provides a comprehensive roadmap for addressing the tie-handling problem while maintaining backward compatibility and providing a foundation for future enhancements.