# Price Position Tie Handling

## Problem Statement

The current `current_hour_in_cheapest` capabilities break when multiple hours have identical prices. The existing implementation uses strict array positions after sorting, which means:

- When 8 hours have the same low price, only the first 3 in the sorted array get "cheapest" rankings (ranks 1, 2, 3)
- The other 5 equally cheap hours get rank 0 (not cheapest) 
- This creates unfair situations where equally priced hours don't get equal treatment

## Requirements

1. **Fix tie handling**: Create a new capability that provides fair ranking for hours with identical prices
2. **Generic solution**: Single capability that can be used to compare against any threshold (1st, 2nd, 3rd cheapest, etc.)
3. **Backward compatible**: Don't break existing flows that use current capabilities
4. **Clean naming**: Avoid long capability names like `current_hour_price_vs_3rd_cheapest_8h`
5. **Flow integration**: New flow conditions to use the capability for "cheaper or equal" comparisons

## Expected Outcome

1. **New capability**: `current_hour_price_position` that returns position value where equally priced hours get identical values
2. **New flow conditions**: "Current hour price position vs Nth threshold" with operators (≤, <, =, ≥)
3. **Tie resolution**: Hours with identical prices all get the same position value (e.g., all hours with cheapest price get position 1.0)
4. **Usage example**: Flow condition "Current hour price position ≤ 3.0" means "current hour is cheaper or equal to 3rd cheapest price"

## Additional Suggestions

- Position values should be clean integers (1.0, 2.0, 3.0) representing which price tier the current hour matches
- Multiple hours with same price should all get identical position values
- Consider adding this as an enhancement to existing capabilities rather than replacement

## Other Important Agreements

- User prefers generic solution over multiple specific capabilities
- User wants clean, short capability names
- Solution must be backward compatible with existing flows
- Focus on solving the tie problem specifically mentioned: "when current hour has the same price when one of these, it never is 3rd cheapest"