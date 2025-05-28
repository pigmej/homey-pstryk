# Price Position Helper Functions - Implementation Summary

## Overview

This implementation adds comprehensive price position helper functions to the PSTRYK Homey app, allowing users to determine the exact position of the current hour when electricity prices are sorted by cost within configurable time windows.

## What Was Implemented

### 1. New Flow Conditions

#### `hour_position_cheapest_to_expensive`
- **Purpose:** Check current hour's position when sorted from cheapest to most expensive
- **Parameters:**
  - `operator`: exactly, at or before, at or after, before, after
  - `position`: Number (1-48)
  - `window`: 4, 8, 16, 24, 36 hours
- **Usage:** Perfect for triggering actions when prices are in the cheapest X positions

#### `hour_position_expensive_to_cheapest`
- **Purpose:** Check current hour's position when sorted from most expensive to cheapest
- **Parameters:**
  - `operator`: exactly, at or before, at or after, before, after
  - `position`: Number (1-48)
  - `window`: 4, 8, 16, 24, 36 hours
- **Usage:** Ideal for avoiding peak pricing periods

### 2. New Flow Actions

#### `get_hour_position_cheapest_to_expensive`
- **Purpose:** Returns exact position and total hours (cheapest first sorting)
- **Parameters:**
  - `window`: 4, 8, 16, 24, 36 hours
- **Returns:**
  - `position`: Current hour's rank (1 = cheapest)
  - `total_hours`: Total hours in window

#### `get_hour_position_expensive_to_cheapest`
- **Purpose:** Returns exact position and total hours (expensive first sorting)
- **Parameters:**
  - `window`: 4, 8, 16, 24, 36 hours
- **Returns:**
  - `position`: Current hour's rank (1 = most expensive)
  - `total_hours`: Total hours in window

### 3. Core Helper Function

#### `calculateExactPricePosition(hourWindow, cheapestFirst)`
- **Location:** `drivers/pstryk_price/device.js`
- **Purpose:** Core calculation logic for price positioning
- **Parameters:**
  - `hourWindow`: Time window in hours
  - `cheapestFirst`: Boolean for sorting direction
- **Returns:** Object with position and totalHours

## Technical Implementation

### Files Modified

1. **`app.json`**
   - Added 2 new flow conditions in the `conditions` array
   - Added 2 new flow actions in the `actions` array

2. **`drivers/pstryk_price/device.js`**
   - Added `calculateExactPricePosition()` helper function
   - Added storage of `_validFrames` and `_currentFrame` for helper access

3. **`drivers/pstryk_price/driver.js`**
   - Added flow condition handlers for new position conditions
   - Added flow action handlers for new position actions

### Key Features

- **Exact Position Calculation:** Unlike existing functions that only show top 3, these provide exact rankings (1st, 2nd, 3rd, ..., Nth)
- **Bidirectional Sorting:** Support for both cheapest-first and expensive-first sorting
- **Flexible Time Windows:** Support for 4, 8, 16, 24, and 36-hour windows
- **Comprehensive Operators:** Support for exact matches, ranges, and comparisons
- **Integration with Existing Logic:** Reuses existing price data and validation

## Usage Examples

### Smart Device Control
```
WHEN: Current hour position (cheapest to expensive) at or before 3 in 24-hour window
THEN: Turn on high-consumption devices
```

### Peak Avoidance
```
WHEN: Current hour position (expensive to cheapest) at or before 5 in 24-hour window
THEN: Send notification "High prices - reduce usage"
```

### Percentage-Based Logic
```
ACTION: Get hour position (cheapest to expensive) in 24-hour window
IF: position ÷ total_hours ≤ 0.25
THEN: Enable battery charging
```

## Advantages Over Existing Functions

1. **Granular Control:** Get exact position instead of just "top 3"
2. **Flexible Thresholds:** Use any position (1-48) as threshold
3. **Bidirectional Sorting:** Handle both cheap and expensive scenarios
4. **Multiple Time Windows:** Choose optimal window for each use case
5. **Rich Comparisons:** Use various operators for complex logic
6. **Percentage Calculations:** Calculate relative position for dynamic thresholds

## Flow Integration

### WHEN Conditions
Use the new conditions in the WHEN section of flows to trigger actions based on price position.

### AND Conditions
Use the new conditions in AND sections to add price position requirements to existing flows.

### Action Cards
Use the action cards to get exact position values for calculations and logic tags.

## Migration Path

Existing users can gradually migrate from the current "top 3 cheapest" approach to the more flexible position-based system while maintaining backward compatibility with existing flows.

## Testing Recommendations

1. Test with different time windows to find optimal settings
2. Verify position calculations during price transitions
3. Test edge cases with limited price data
4. Validate operator logic with various position values
5. Confirm integration with existing price update cycles

This implementation provides a comprehensive solution for fine-grained electricity price optimization in Homey flows.