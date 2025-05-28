# Price Position Helper Functions - Usage Examples

This document shows how to use the new price position helper functions in Homey flows.

## Overview

The new helper functions provide exact position information for the current hour when electricity prices are sorted by cost. This gives you much more granular control than the existing "top 3 cheapest" functionality.

## New Flow Conditions

### 1. Current Hour Position (Cheapest to Expensive)

**Flow Card ID:** `hour_position_cheapest_to_expensive`

**Description:** Check where the current hour ranks when all hours in a time window are sorted from cheapest to most expensive.

**Parameters:**
- **Operator:** `exactly`, `at or before`, `at or after`, `before`, `after`
- **Position:** Number (1-48)
- **Window:** `4 hours`, `8 hours`, `16 hours`, `24 hours`, `36 hours`

**Examples:**
- "Current hour is exactly 1 when sorted cheapest to expensive in 8-hour window" (current hour is the cheapest)
- "Current hour is at or before 3 when sorted cheapest to expensive in 24-hour window" (current hour is among the 3 cheapest)
- "Current hour is after 12 when sorted cheapest to expensive in 24-hour window" (current hour is more expensive than average)

### 2. Current Hour Position (Expensive to Cheapest)

**Flow Card ID:** `hour_position_expensive_to_cheapest`

**Description:** Check where the current hour ranks when all hours in a time window are sorted from most expensive to cheapest.

**Parameters:**
- **Operator:** `exactly`, `at or before`, `at or after`, `before`, `after`
- **Position:** Number (1-48)
- **Window:** `4 hours`, `8 hours`, `16 hours`, `24 hours`, `36 hours`

**Examples:**
- "Current hour is exactly 1 when sorted expensive to cheapest in 8-hour window" (current hour is the most expensive)
- "Current hour is at or before 2 when sorted expensive to cheapest in 24-hour window" (current hour is among the 2 most expensive)

## New Flow Actions

### 1. Get Hour Position (Cheapest to Expensive)

**Flow Card ID:** `get_hour_position_cheapest_to_expensive`

**Description:** Returns the exact position and total hours when sorted cheapest to expensive.

**Parameters:**
- **Window:** `4 hours`, `8 hours`, `16 hours`, `24 hours`, `36 hours`

**Returns:**
- **position:** The current hour's position (1 = cheapest)
- **total_hours:** Total number of hours in the window

### 2. Get Hour Position (Expensive to Cheapest)

**Flow Card ID:** `get_hour_position_expensive_to_cheapest`

**Description:** Returns the exact position and total hours when sorted expensive to cheapest.

**Parameters:**
- **Window:** `4 hours`, `8 hours`, `16 hours`, `24 hours`, `36 hours`

**Returns:**
- **position:** The current hour's position (1 = most expensive)
- **total_hours:** Total number of hours in the window

## Use Cases

### 1. Smart Water Heater Control

**WHEN:** Current hour position (cheapest to expensive) is at or before 3 in 8-hour window
**THEN:** Turn on water heater

This turns on the water heater only when the current hour is among the 3 cheapest in the next 8 hours.

### 2. EV Charging Optimization

**WHEN:** Current hour position (cheapest to expensive) is exactly 1 in 24-hour window
**AND:** EV battery level is below 80%
**THEN:** Start EV charging

This starts EV charging only during the absolute cheapest hour of the day.

### 3. Avoid Peak Pricing

**WHEN:** Current hour position (expensive to cheapest) is at or before 5 in 24-hour window
**THEN:** Send notification "High electricity prices - consider reducing usage"

This sends a warning when the current hour is among the 5 most expensive of the day.

### 4. Dynamic Device Scheduling

**WHEN:** Current hour position (cheapest to expensive) is at or before 6 in 16-hour window
**AND:** Washing machine is ready
**THEN:** Start washing machine

This provides flexible scheduling - the washing machine will start when prices are in the cheaper half of the next 16 hours.

### 5. Percentage-Based Logic

**ACTION:** Get hour position (cheapest to expensive) in 24-hour window
**IF:** position ÷ total_hours ≤ 0.25 (top 25% cheapest)
**THEN:** Enable high-consumption devices

This calculates if the current hour is in the cheapest 25% of the day.

## Advanced Examples

### Smart Home Energy Manager

```
WHEN: Current hour position (cheapest to expensive) exactly 1 in 8-hour window
THEN: 
  - Turn on dishwasher (if ready)
  - Turn on washing machine (if ready) 
  - Increase heat pump temperature by 2°C
  - Send notification "Cheapest hour - maximizing energy usage"

AND WHEN: Current hour position (expensive to cheapest) at or before 3 in 24-hour window
THEN:
  - Turn off non-essential devices
  - Lower heat pump temperature by 1°C
  - Send notification "Peak pricing - minimizing energy usage"
```

### Battery Storage Optimization

```
WHEN: Current hour position (cheapest to expensive) at or before 4 in 24-hour window
AND: Home battery level below 90%
THEN: Charge home battery from grid

WHEN: Current hour position (expensive to cheapest) at or before 6 in 24-hour window  
AND: Home battery level above 20%
THEN: Use battery power instead of grid
```

## Tips for Usage

1. **Start with larger time windows** (24-36 hours) for better optimization opportunities
2. **Use "at or before" conditions** for flexibility (e.g., "at or before 3" means top 3 positions)
3. **Combine both sorting directions** for comprehensive price management
4. **Consider using percentage calculations** for dynamic thresholds (position ÷ total_hours)
5. **Test with different window sizes** to find what works best for your devices and usage patterns

## Migration from Existing Functions

If you're currently using the existing cheapest hour functions:

- **Old:** "Current hour is the cheapest among 8-hour window" 
- **New:** "Current hour position (cheapest to expensive) exactly 1 in 8-hour window"

- **Old:** "Current hour is among 3 cheapest in 8-hour window"
- **New:** "Current hour position (cheapest to expensive) at or before 3 in 8-hour window"

The new functions provide much more flexibility and precision for your energy optimization flows.