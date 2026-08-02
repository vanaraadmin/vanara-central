# HOUSEKEEPING_PRODUCT_RULES

## Purpose
Business Rules Specification for Housekeeping.

### Product Principles
- Mobile first
- Operational first
- Compact home
- Room workspace on tap

## Turnover
- Reception owns room release.
- Housekeeping cannot start turnover before room_release.
- Force Room Released = Owner only + mandatory reason.

## Standard Cleaning
- Every 3 occupied days.
- Independent from linen.
- Resets only cleaning counters.

## Linen
- Independent counters.
- Manual override allowed.
- Standard+Linen resets both.

## Water Refill
Occupied rooms only.
- Bungalow 2
- Villa 4
- Yurt/Tent 2

Exclude:
- Vacant
- Checkout
- Waiting Reception

## On-demand Cleaning
Can exist even if room is CLEAN.
Completion:
- Standard Cleaning
- Standard Cleaning + Linen

## Reception Integration
Read only:
- room_released
- passport_missing
- deposit_pending

Never resolved by Housekeeping.

## Claim
One task.
One assignee.
Only assignee or Owner completes.

## Room Card
Operational summary only.
No full checklist.

## Invariants
- Reception owns guest lifecycle.
- Housekeeping owns cleaning.
- Maintenance owns repairs.
- Procurement owns purchasing.
- Cleaning != Linen.
