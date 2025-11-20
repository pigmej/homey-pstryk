# Price Position Tie Handling - Architecture Analysis

## Context Analysis

The current `current_hour_in_cheapest` capabilities in the PSTRYK Homey app suffer from a critical tie-handling flaw. When multiple hours have identical electricity prices, the implementation uses strict array positioning after sorting, causing:

- **Unfair ranking**: Only the first 3 hours in sorted order get "cheapest" rankings (1, 2, 3)
- **Tie discrimination**: Additional hours with identical prices receive rank 0 (not cheapest)
- **User impact**: Equally cheap hours are treated differently, breaking user expectations

The existing architecture has multiple capabilities for different time windows (4h, 8h, 12h, 24h, 36h) but all share the same fundamental ranking algorithm that doesn't handle ties properly.

## Technology Recommendations

### Core Algorithm Pattern
**IMPORTANT**: Implement a **tiered ranking system** instead of positional ranking:
- Group hours by identical prices
- Assign the same position value to all hours in the same price tier
- Use floating-point values (1.0, 2.0, 3.0) for clear distinction from existing integer-based capabilities

### Data Structure
```javascript
// Current problematic approach:
sortedFrames[index] === currentFrameIndex ? rankValue = index + 1 : rankValue = 0

// Proposed tiered approach:
priceTiers = groupFramesByPrice(frames)
currentHourTier = findTierForCurrentHour(priceTiers, currentFrame)
position = currentHourTier.position // All hours in same tier get identical position
```

### Capability Design Pattern
Follow the existing Homey Compose pattern with:
- **Single generic capability**: `current_hour_price_position`
- **Parameterized flow conditions**: Support multiple operators (≤, <, =, ≥)
- **Backward compatibility**: Keep existing capabilities unchanged

## System Architecture

### 1. New Capability Layer

**Capability Definition:**
```
current_hour_price_position
- Type: number
- Range: 1.0 to N.0 (where N = number of distinct price tiers)
- Description: "Current hour's price position when sorted by price (identical prices get same position)"
```

**Implementation Location:**
- File: `.homeycompose/capabilities/current_hour_price_position.json`
- Driver method: `calculateTiedPricePosition(hourWindow)`

### 2. Flow Integration Layer

**New Flow Conditions:**
- `current_hour_price_position_vs_threshold`
- Parameters: operator (≤, <, =, ≥), threshold (1.0-48.0), window (4h-36h)
- Implementation: `.homeycompose/flow/conditions/current_hour_price_position_vs_threshold.json`

**Trigger Support:**
- `current_hour_price_position_changed`
- Tokens: position, total_tiers, window_size

### 3. Algorithm Enhancement Layer

**Core Function:**
```javascript
calculateTiedPricePosition(hourWindow) {
  // 1. Get frames in window
  // 2. Group by identical prices
  // 3. Sort groups by price (ascending)
  // 4. Assign tier positions (1.0, 2.0, 3.0...)
  // 5. Find current hour's tier
  // 6. Return tier position
}
```

**Tie Resolution Logic:**
- Price tolerance: Use exact equality (price_gross values are precise)
- Tier assignment: Sequential numbering starting from 1.0
- Edge cases: Handle missing data gracefully

## Integration Patterns

### 1. Backward Compatibility Strategy
**IMPORTANT**: Maintain all existing capabilities without changes:
- `current_hour_in_cheapest` (8h window)
- `current_hour_in_cheapest_4h`, `12h`, `24h`, `36h`
- Existing flow conditions and triggers

**Migration Path:**
- Users can gradually migrate to new capability
- Documentation will show equivalent conditions
- No breaking changes to existing flows

### 2. Driver Integration Pattern

**Capability Registration:**
```javascript
// In device.js onInit()
await this.addCapability("current_hour_price_position");

// In updatePrices()
const tiedPosition = this.calculateTiedPricePosition(8);
await this.setCapabilityValue("current_hour_price_position", tiedPosition);
```

**Flow Condition Handler:**
```javascript
// In driver.flow.compose.json
{
  "id": "current_hour_price_position_vs_threshold",
  "args": [
    {"name": "device", "type": "device", "filter": "driver_id=pstryk_price"},
    {"name": "operator", "type": "dropdown", "values": [{"id": "lte", "label": "≤"}, ...]},
    {"name": "threshold", "type": "number", "min": 1, "max": 48},
    {"name": "window", "type": "dropdown", "values": [{"id": "8", "label": "8 hours"}, ...]}
  ]
}
```

### 3. Data Flow Pattern

```
API Response → Frame Processing → Price Tier Grouping → Position Calculation → Capability Update → Flow Trigger
```

**Cache Strategy:**
- Reuse existing `_validFrames` and `_currentFrame` caching
- Add `_priceTiersCache` for performance optimization
- Cache invalidation: Same as existing price update cycle

## Implementation Guidance

### Phase 1: Core Algorithm
1. **Create tier grouping function** in `device.js`
2. **Implement tie-aware position calculation**
3. **Add comprehensive logging** for debugging tie scenarios
4. **Unit test** with various tie patterns (2-way ties, 3-way ties, etc.)

### Phase 2: Capability Integration
1. **Create capability definition** in `.homeycompose/capabilities/`
2. **Add capability to device initialization**
3. **Update price refresh cycle** to set new capability value
4. **Add trigger for capability changes**

### Phase 3: Flow Integration
1. **Create flow condition definition** in `.homeycompose/flow/conditions/`
2. **Implement condition logic** in driver
3. **Create flow action** for getting position with parameters
4. **Add comprehensive flow documentation**

### Phase 4: Testing & Validation
1. **Test tie scenarios** with identical prices
2. **Validate backward compatibility** 
3. **Performance testing** with large price windows
4. **User acceptance testing** with real price data

## Critical Considerations

### Performance Impact
**IMPORTANT**: The tiered grouping algorithm has O(n log n) complexity due to sorting, but this is acceptable because:
- Price data sets are small (max 48 hours)
- Existing sorting operations already present
- Cache reuse minimizes redundant calculations

### Data Precision
- Use exact price comparison (price_gross values are precise to 4 decimal places)
- Avoid floating-point comparison issues by using consistent precision
- Handle edge cases where all prices are identical

### User Experience
- Clear capability naming: `current_hour_price_position`
- Intuitive flow conditions: "Current hour price position ≤ 3.0"
- Comprehensive documentation with examples
- Migration guide from existing capabilities

### Error Handling
- Graceful degradation when price data is unavailable
- Consistent behavior across different time windows
- Proper logging for troubleshooting tie scenarios

## Expected Outcomes

### Functional Benefits
- **Fair tie handling**: All hours with identical prices get same position
- **Generic solution**: Single capability works for any threshold comparison
- **Clean integration**: Intuitive flow conditions with standard comparison operators
- **Future-proof**: Extensible to additional ranking scenarios

### Technical Benefits
- **Maintainable**: Single algorithm instead of multiple similar implementations
- **Performant**: Efficient caching and reuse of existing data structures
- **Compatible**: Zero impact on existing functionality
- **Testable**: Clear separation of concerns enables comprehensive testing

### User Benefits
- **Accurate automation**: Flows trigger correctly for tied price scenarios
- **Simplified logic**: "≤ 3.0" is more intuitive than complex rank combinations
- **Flexible usage**: Can compare against any threshold, not just 1-3
- **Better insights**: Clear visualization of price position trends

This architecture provides a robust, backward-compatible solution that addresses the core tie-handling problem while establishing a foundation for future price ranking enhancements.