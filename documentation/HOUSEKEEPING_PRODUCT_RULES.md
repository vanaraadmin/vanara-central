# HOUSEKEEPING_PRODUCT_RULES

## Purpose
Business Rules Specification for Housekeeping.

## Housekeeping Philosophy
- Housekeeping is not a room browser.
- Housekeeping is an operational to-do list.
- Housekeeping only shows work that exists.
- Rooms with no active Housekeeping work must never appear.
- Housekeeping owns tasks only.

## Room Workspace Ownership
- Room Workspace owns every room.
- Room Workspace is the only place where every room can be browsed.
- Room Workspace is the only place where full room information is displayed.
- Room Workspace is the only place where On-Demand Cleaning may be created.
- Room Workspace displays Operational Availability and Housekeeping Status as separate dimensions.
- Owner and Manager may change Operational Availability only from Room Workspace.

## Independent Room Dimensions
- Operational Availability is either OPERATING or NOT_OPERATING.
- Housekeeping Status is either READY or NOT_READY.
- Occupancy is derived from real stay and Reception state.
- Maintenance blocks are derived from real Maintenance tickets.
- Changing Operational Availability must never change Housekeeping Status.
- Changing Housekeeping Status must never change Operational Availability.
- NOT_OPERATING is an internal Vanara operational indicator only. Beds24 remains the booking availability source of truth.
- NOT_OPERATING units remain visible in Room Workspace for Owner/Manager inspection and preparation.
- NOT_OPERATING units are excluded from active operational Housekeeping counts and automatic task generation.
- NOT_OPERATING units do not generate Water Refill, scheduled Cleaning, Full Cleaning, Turnover, check-in readiness alerts, or occupied-room cleaning cycles.

## Housekeeping Workspace
- Initial state shows compact Priority, Normal, and Water summary cards only.
- Summary counters display room-count wording: 0 Rooms, 1 Room, 2 Rooms, and so on.
- Tapping a summary expands only that actionable list.
- Do not show clean rooms.
- Do not show a Ready / No Action Required room list.
- Do not browse every room from Housekeeping Workspace.
- Do not create On-Demand Cleaning from Housekeeping Workspace.
- Room identity opens Room Workspace.
- A task appears in one visible queue only.
- Task rows show room name, intervention type, simple reason, assignee, execution state, and the next relevant action.
- Task rows must not expose an explicit Claim action.
- Staff-facing copy must not expose internal state-machine, idempotency, version, or conflict-code wording.

## Trust Model
- Vanara trusts trained Housekeeping staff.
- The software decides where, when, and which intervention level.
- The software does not teach staff how to clean.
- When an operator presses Complete, Vanara assumes the work has been performed correctly.
- Do not require confirmation of bathroom cleaning, floors, waste, towels, shampoo, shower gel, toilet paper, amenities, or similar operational details.

## Intervention Types
Intervention types are product concepts, not checklists.

### Cleaning
General room cleaning plus amenities check.

### Full Cleaning
General room cleaning plus linen change plus amenities check.

## Optional Help
- Tapping Cleaning or Full Cleaning may show a static information sheet.
- The information sheet is informational only.
- It does not block execution.
- It is not tracked.

Cleaning help text:
- General room cleaning.
- Please also check room amenities before completion.

Full Cleaning help text:
- General room cleaning.
- Replace bed linen.
- Please also check room amenities before completion.

## Turnover
- Reception owns room release.
- Housekeeping cannot start turnover before room_release.
- Turnover uses an operational workflow: Start, then Finish.
- Start automatically assigns the task to the current operator when the task is unassigned.
- Force Room Released = Owner only + mandatory reason.

## Cleaning Cadence
- Cleaning is due every 3 occupied days.
- Cleaning is independent from linen.
- Cleaning completion resets only cleaning counters.
- Cleaning and Full Cleaning use an operational workflow: Start, then Finish.
- Start automatically assigns the task to the current operator when the task is unassigned.
- If another operator already owns the task, Start is not available to regular operators.

## Priority Escalation
- Escalation is derived from the resort-local operational calendar date.
- A Standard Cleaning task or On-Demand Cleaning task whose original operational_date is earlier than the current resort-local operational date appears in Priority.
- The same task remains Priority until it is completed, cancelled, skipped, or no longer belongs to the active stay.
- The original operational_date and due_cycle_date are never rewritten for escalation.
- Escalation does not create a duplicate task.
- Escalation does not create repeated audit events during read-only overview requests.
- Normal contains same-day active Cleaning, On-Demand Cleaning, and Full Cleaning work.
- Water Refill never escalates into Priority.

Escalation display reason codes:
- standard_cleaning_previous_day
- on_demand_previous_day

## Linen
- Linen has independent counters.
- Manual override is allowed.
- Full Cleaning resets both cleaning and linen counters.

## Water Refill
Occupied rooms only.
- Bungalow 2
- Villa 4
- Yurt/Tent 2

MVP quantity is hardcoded by accommodation type only. Guest Count is informational and must never be used for Water Refill quantity or eligibility.
NOT_OPERATING units never generate Water Refill.

Water uses a simplified execution workflow:
- Available.
- Complete.

Water has one operator action: Complete.
Completing Water automatically assigns the current operator, records completion, creates the completion audit event, removes the task from Water, and refreshes the summary.
Water does not expose Claim, Start, In Progress, or release actions in the operator UX.

Exclude:
- Vacant
- Checkout
- Checkout-release workflow block

## On-Demand Cleaning
- Can exist even if room is clean.
- Originates from Room Workspace, not Housekeeping Workspace.
- Note is optional.
- Completion choices are Cleaning or Full Cleaning.

## Reception Integration
Read only:
- room_released
- passport_missing
- deposit_pending

Never resolved by Housekeeping.

## Execution Ownership
One task.
One assignee.
Only assignee or Owner completes ongoing Cleaning and Turnover work.

Operator action flow:
- Cleaning, Full Cleaning, On-Demand Cleaning, and Turnover: Start, then Finish.
- Start automatically assigns the task to the current operator when no assignee exists.
- Water Refill: Complete.
- Complete automatically assigns Water to the current operator when no assignee exists.
- Tasks already owned by another operator do not show the next operator action to regular operators.
- Completed, skipped, and cancelled tasks leave the active Housekeeping queue.
- If the task changes elsewhere, refresh the current read model and show a concise explanation.

## Room Card
Operational summary only.
No detailed operational checklist.
Room identity opens Room Workspace.

## Invariants
- Reception owns guest lifecycle.
- Housekeeping owns cleaning tasks.
- Maintenance owns repairs.
- Procurement owns purchasing.
- Cleaning != Linen.
- Housekeeping Workspace contains only rooms with actual Housekeeping work.
- Housekeeping Workspace excludes NOT_OPERATING units from active queues even when their independent Housekeeping Status is NOT_READY.
- Normal list contains only active Cleaning, On-Demand Cleaning, and relevant Full Cleaning work.
- Priority list contains active turnover work, previous-operational-day Cleaning, previous-operational-day On-Demand Cleaning, and existing urgent or blocked task work.
- Water list contains only active daily refill work.
- Water quantity is Bungalow 2, Yurt/Tent 2, Villa 4, independent of guest count.
- Guest Count is informational only and must not feed Water Refill, Cleaning, Full Cleaning, Linen, Priority, task generation, Procurement, or Housekeeping logic.
- Future changes to guest-count usage require explicit Product Owner decision.
