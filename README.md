# PSTRYK Electricity Price

Monitor current and historical electricity prices from PSTRYK, use PSTRYK meter to monitor the current energy consumption

**Version:** 0.1.0
**Author:** Jedrzej Nowak

## Table of Contents

- [Features](#features)
- [Capabilities](#capabilities)
- [Flow Cards](#flow-cards)
  - [Triggers](#triggers)
  - [Conditions](#conditions)
  - [Actions](#actions)
- [Installation](#installation)
- [Configuration](#configuration)

## Features

- Real-time electricity price monitoring from PSTRYK API
- Price position tracking with tie-aware ranking
- Smart usage period detection (cheap/expensive hours)
- Multiple time window analysis (4h, 8h, 12h, 24h, 36h)
- Automatic price data refresh
- Energy consumption monitoring with PSTRYK meter

## Capabilities

The app provides the following device capabilities:

### Price Information

| Capability | Description | Type |
|------------|-------------|------|
| `current_hour_price_position` | Current hour's price position when sorted by price (identical prices get same position) | number |

### Ranking & Position

| Capability | Description | Type |
|------------|-------------|------|
| `current_hour_price_position` | Current hour's price position when sorted by price (identical prices get same position) | number |

## Flow Cards

### Triggers

These cards trigger flows when specific events occur:

#### Current hour in cheapest status changed (12h window)
No description available

**Tokens:**
- `current_hour_in_cheapest_12h` (number): Cheapest rank

#### Current hour in cheapest status changed (24h window)
No description available

**Tokens:**
- `current_hour_in_cheapest_24h` (number): Cheapest rank

#### Current hour in cheapest status changed (36h window)
No description available

**Tokens:**
- `current_hour_in_cheapest_36h` (number): Cheapest rank

#### Current hour in cheapest status changed (4h window)
No description available

**Tokens:**
- `current_hour_in_cheapest_4h` (number): Cheapest rank

#### Current hour in cheapest status changed (8h window)
No description available

**Tokens:**
- `current_hour_in_cheapest` (number): Cheapest rank

#### Current hour price position changed
Triggered when the current hour price position changes

**Tokens:**
- `position` (number): Position
- `total_tiers` (number): Total price tiers
- `window_size` (number): Window size (hours)

### Conditions

These cards check conditions in your flows:

#### Price Conditions

- **Current price compared to value**: No description available
- **Current price compared to daily average**: No description available

#### Position Conditions

- **Current hour price position vs Nth threshold**: Compare current hour price position against a threshold value

#### Period Conditions

- **Is current price cheap**: No description available
- **Is current price expensive**: No description available
- **Is maximise usage period active**: No description available
- **Is minimise usage period active**: No description available
- **Is normal usage period active**: No description available

#### Ranking Conditions

- **Current hour is among cheapest (8h window)**: No description available
- **Current hour is among cheapest (12h window)**: No description available
- **Current hour is among cheapest (24h window)**: No description available
- **Current hour is among cheapest (36h window)**: No description available
- **Current hour is among cheapest (4h window)**: No description available

### Actions

These cards perform actions in your flows:

#### Get current hour cheapest rank (8h window)
No description available

**Arguments:**

#### Get current hour cheapest rank (12h window)
No description available

**Arguments:**

#### Get current hour cheapest rank (24h window)
No description available

**Arguments:**

#### Get current hour cheapest rank (36h window)
No description available

**Arguments:**

#### Get current hour cheapest rank (4h window)
No description available

**Arguments:**

#### Get current hour price position
Get the current hour's price position for a specific time window

**Arguments:**
- `window` (dropdown): window

#### Get current hour position (cheapest to expensive)
No description available

**Arguments:**
- `window` (dropdown): window

#### Get current hour position (expensive to cheapest)
No description available

**Arguments:**
- `window` (dropdown): window

#### Refresh price data
Manually refresh the price data cache

**Arguments:**

## Installation

1. Install the app from the Homey App Store
2. Add a new PSTRYK Price device
3. Configure your PSTRYK API key in the device settings
4. Optionally configure the price refresh hour (default: 15:00)

## Configuration

### Device Settings

- **API Key**: Your PSTRYK API key (required)
- **Price Refresh Hour**: Hour when price data should be refreshed (default: 15)
- **Price Difference Threshold**: Percentage threshold for grouping similar prices (default: 10%)
- **Today Label**: Custom label for today's date (default: "Today")
- **Tomorrow Label**: Custom label for tomorrow's date (default: "Tomorrow")

## Usage Examples

### Turn on device during cheapest hours

**WHEN** Current hour in cheapest (8h) changed
**AND** Current hour is among cheapest 3 (8h window)
**THEN** Turn on washing machine

### Alert when price is expensive

**WHEN** Minimise period is active
**THEN** Send notification "Electricity is expensive now"

### Smart heating control

**WHEN** Current hour price position changed
**AND** Current hour price position <= 3 (24h window)
**THEN** Enable EV charger
**ELSE** Disable EV charger

## License

This is an unofficial PSTRYK integration. Use at your own risk.

## Support

For issues and feature requests, please use the GitHub issue tracker.
