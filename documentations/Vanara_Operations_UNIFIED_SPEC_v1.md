# Vanara Operations MVP
## Unified Product & Functional Specification

This document consolidates the executive PRD with the complete functional specification. Where overlap existed, the detailed functional specification is considered authoritative.

---

## Executive Product Requirements

# PRD_001 -- Vanara Operations MVP

## Product Requirements Document

**Status:** Draft v1.0\
**Language:** English

# 1. Product Vision

Vanara Central is the internal operating system of the resort.

The first released module is **Vanara Operations**, a mobile-first
Progressive Web App (PWA) for staff. Its purpose is to centralize daily
operations and progressively replace external tools such as LINE.

# 2. Architecture Decisions

## ADR-001 -- Standalone PWA

The application SHALL NOT be developed as a LINE LIFF application. It
SHALL be delivered as a standalone installable Progressive Web App.

Reasons: - full control of UX - no LINE ecosystem limitations - native
installation - future scalability

## ADR-002 -- Internal Communication

The application shall progressively replace the LINE group as the
primary communication tool.

## ADR-003 -- Push Notifications

Push notifications are a mandatory platform capability. They must work
for chat messages and operational events.

# 3. Scope

The MVP targets only resort staff.

Supported languages: - English - Thai

No website is included.

# 4. Design Principles

-   Mobile first
-   Extremely simple UI
-   Large touch targets
-   Minimum number of taps
-   Operational efficiency over aesthetics

# 5. Home Dashboard

The landing page contains six operational modules:

1.  Arrivals & Departures
2.  Room Workspace
3.  Housekeeping
4.  Availability
5.  Maintenance
6.  Procurement

# 6. Arrivals & Departures

Purpose: Display today's check-ins and check-outs.

Features: - Today's arrivals - Today's departures - Date picker - View
arrivals/departures for any selected day

# 7. Room Workspace

Displays every bungalow, villa and tent as cards.

Each card includes: - room photo - room name - occupancy status -
housekeeping status - maintenance indicator

Housekeeping states: - Dirty - Cleaning in Progress - Clean

Occupancy: - Occupied - Vacant

Selecting a room opens Room Detail.

# 8. Room Detail

Central operational page.

Displays: - Occupancy status - Current guest information - Name -
Surname - Nationality - Contact - Reservation

Actions: - Start housekeeping - Update housekeeping status - Send room
to quality check - Open maintenance ticket - Upload photos - Describe
issue

# 9. Housekeeping

Dashboard showing: - Dirty rooms - Cleaning in Progress - Clean rooms

Staff can: - take ownership of cleaning - update cleaning status -
complete cleaning - submit room for quality inspection

# 10. Availability

Purpose: Allow reception staff to answer walk-in requests without
contacting owners.

Input: - Arrival date - Departure date

Output: For each accommodation type: - availability - nightly price -
total stay price

Display individual available units.

# 11. Maintenance

Create maintenance tickets.

Required fields: - Room - Description - Photos

Future evolution: - Internal technician assignment - External contractor
list - Owner dashboard with ticket overview and out-of-service rooms

# 12. Procurement

Purpose: Replace purchase requests sent via LINE.

Features: - predefined inventory checklist - custom free-text item -
send purchase request to owners

# 13. Internal Chat

The platform will include an internal persistent chat.

Initial features: - text messages - message history - notifications

Future: - @Room - @Staff - @Maintenance - backend entity references

# 14. Push Notifications

Mandatory capabilities: - Chat messages - Mentions - Housekeeping
assignments - Maintenance updates - Procurement requests

Requirements: - Work while app is closed - Work on locked devices -
Deep-link into the correct screen - Backend persistence independent of
notification delivery

# 15. Non-functional Requirements

-   Responsive mobile UI
-   Installable PWA
-   Backend is the single source of truth
-   No duplicated business logic in frontend
-   English and Thai only

# 16. MVP Success Criteria

The MVP is successful when staff can perform daily resort operations
without relying on LINE for operational workflows.

Operational communication, room management, housekeeping, maintenance,
availability lookup and procurement must all be executable from Vanara
Operations.


---

## Detailed Functional Specification



\# PRD\_002 – Vanara Operations

\## Product Requirements Document



Version: 1.0

Status: Draft

Language: English



\---



\# 1. Purpose



This document defines the functional specification of the Vanara Operations application.



Its purpose is to allow any developer to implement the complete MVP without requiring additional functional explanations.



This document focuses only on frontend behavior.



Backend implementation is documented separately.



\---



\# 2. Product Vision



Vanara Operations is the operational application used by resort staff.



It is the first module of the Vanara Central ecosystem.



The application replaces operational communication currently performed through LINE and centralizes daily resort activities.



The application is NOT a PMS.



Beds24 remains the reservation system.



Vanara Operations consumes operational information and exposes it through a mobile-first interface.



\---



\# 3. Product Philosophy



Every action performed by resort staff should require the minimum possible number of taps.



Whenever possible:



\- avoid navigation

\- avoid nested menus

\- expose information immediately

\- make every screen actionable



The application is built for people working while walking around the resort.



Speed is more important than visual complexity.



\---



\# 4. Platform



Application type



Progressive Web App (PWA)



Installable on:



\- Android

\- iPhone

\- Tablets



No desktop version is planned for the MVP.



\---



\# 5. Supported Languages



The operational application supports only:



\- English

\- Thai



Language selection follows device language.



If unsupported:



Default = English.



\---



\# 6. Authentication



The MVP supports only internal staff.



Roles include:



\- Owner

\- Reception

\- Housekeeping

\- Maintenance



Permissions will be expanded in future versions.



\---



\# 7. Dashboard



After login the user reaches the Home Dashboard.



The dashboard contains six primary modules.



1\. Arrivals \& Departures



Purpose



Display today's operational movements.



Primary information



• Today's arrivals



• Today's departures



Selecting the module opens the complete calendar view.



\---



2\. Room Workspace



Purpose



Provide a complete operational overview of every accommodation.



This is expected to become the most frequently used screen.



\---



3\. Housekeeping



Purpose



Manage room cleaning.



\---



4\. Availability



Purpose



Allow reception staff to answer walk-in guests without contacting owners.



\---



5\. Maintenance



Purpose



Report problems.



Track maintenance.



\---



6\. Procurement



Purpose



Allow staff to request supplies.



\---



\# 8. Dashboard Behaviour



The dashboard is intentionally simple.



No charts.



No analytics.



No KPI widgets.



Only operational shortcuts.



The dashboard must open in under two seconds under normal network conditions.



\---



\# 9. Arrivals \& Departures Module



Purpose



Provide reception with today's operational schedule.



The landing page contains:



Today's Arrivals



Today's Departures



Calendar button



Selecting Calendar opens any date.



Selecting a date refreshes both lists.



Each reservation row contains:



• Accommodation



• Guest name



• Nationality



• Number of guests



• Arrival time (if available)



• Departure time (if available)



• Reservation status



Touching a reservation opens Room Detail.



\---



\# 10. Room Workspace



This is the operational center of the application.



Every accommodation is represented by a card.



Cards include:



Photo



Accommodation name



Accommodation type



Occupancy



Housekeeping status



Maintenance warning



Availability



Examples



Bungalow 1



Villa 10



Tent 3



\---



\# 11. Card Status



Occupancy



Occupied



Vacant



Housekeeping



Dirty



Cleaning



Ready



Maintenance



Normal



Warning



Out of Service



Each state must be represented by a color badge.



Badges must be readable outdoors.



\---



\# 12. Card Actions



Touching the card opens Room Detail.



No secondary menus.



No long press.



No hidden actions.



One tap only.



\---



\# 13. Room Detail



Room Detail represents the operational hub of a single accommodation.



Every operational action starts from here.



Displayed information



Accommodation name



Photo



Current status



Current guest



Nationality



Reservation dates



Occupancy



Cleaning status



Maintenance status



Notes (future)


# 14. Room Detail Layout



The screen is vertically divided into functional sections.



Order:



1\. Header

2\. Reservation

3\. Guest

4\. Housekeeping

5\. Maintenance

6\. Procurement

7\. Operational Actions



The user should never scroll excessively.



Most-used actions must remain above the fold.



\---



\# 15. Header



The header displays:



\- Accommodation photo

\- Accommodation name

\- Accommodation type

\- Occupancy badge

\- Cleaning badge

\- Maintenance badge



If the room is Out of Service, a prominent red banner appears.



\---



\# 16. Reservation Section



Displays operational reservation data.



Fields:



\- Guest name

\- Arrival

\- Departure

\- Nights

\- Adults

\- Children

\- Nationality

\- Booking source

\- Current status



Examples:



Confirmed



Checked In



Checked Out



Cancelled



No Show



This section is read-only.



Beds24 remains the source of truth.



\---



\# 17. Guest Section



Displays guest information useful during operations.



Example fields:



\- Nationality

\- Language

\- Phone (if available)

\- Internal notes (future)

\- Special requests (future)



This section is informational only.



\---



\# 18. Housekeeping Section



This section is interactive.



Current room status:



Dirty



Cleaning



Ready



Buttons:



Start Cleaning



Mark Ready



Reopen Cleaning



Only actions valid for the current state are visible.



Example:



Dirty



↓



Start Cleaning



↓



Cleaning



↓



Mark Ready



↓



Ready



No invalid buttons should ever be shown.



\---



\# 19. Cleaning Workflow



Dirty



↓



Cleaning



↓



Ready



Optional future states may be introduced without changing the architecture.



No historical workflow is displayed in the MVP.



Only current status matters.



\---



\# 20. Maintenance Section



Displays current maintenance information.



States:



No Issues



Open Issue



Critical



Out of Service



If multiple issues exist, only the highest priority is shown on the Room Workspace card.



Room Detail displays the complete list.



\---



\# 21. Create Maintenance Report



Button:



Report Issue



Pressing the button opens a lightweight form.



Required fields:



Category



Priority



Description



Optional:



Photo



The form must be completable in under 30 seconds.



\---



\# 22. Maintenance Categories



Electrical



Air Conditioning



Water



Furniture



Bathroom



Garden



Cleaning Equipment



Other



Categories are configurable.



\---



\# 23. Maintenance Priorities



Low



Medium



High



Critical



Critical automatically highlights the room across the application.



\---



\# 24. Procurement Section



Purpose



Allow staff to request consumables.



Examples:



Water



Coffee



Soap



Toilet Paper



Towels



Cleaning Products



No inventory management is included in the MVP.



Only requests.



\---



\# 25. Procurement Request



Fields:



Item



Quantity



Optional note



Submit



Once submitted, the request becomes visible to Owners.



No approval workflow is included in the MVP.



\---



\# 26. Operational Actions



Bottom section.



Contains quick shortcuts.



Examples:



Open Chat



Call Reception



Open Guest Reservation



Future AI Assistant



Only actions available for the logged-in role are displayed.



\---



\# 27. Empty States



Every screen must gracefully handle missing data.



Examples:



No arrivals today.



No departures today.



No maintenance issues.



No procurement requests.



Never display blank pages.



Always explain why nothing is shown.



\---



\# 28. Error States



Network unavailable



Unable to synchronize



Reservation unavailable



Server unavailable



Errors must never block navigation.



The application should always recover automatically after connectivity returns.



\---



\# 29. Loading Behaviour



Skeleton loaders are preferred.



Avoid blocking spinners whenever possible.



Navigation should remain responsive.



Lists should progressively populate.



\---



\# 30. Refresh Strategy



Operational screens should automatically refresh.



Recommended interval:



30–60 seconds.



Manual pull-to-refresh is also available.



Users should never need to restart the application to see updates.

# 31. Availability Module



\## Purpose



The Availability module allows staff to answer walk-in guests immediately without opening Beds24.



This module is intentionally lightweight.



It is designed for speed, not reservation management.



Beds24 remains the booking system.



\---



\# 32. Availability Screen



The screen opens on today's date.



The top area contains:



\- Selected date

\- Previous day

\- Next day

\- Calendar picker



Changing the date refreshes availability immediately.



\---



\# 33. Accommodation List



Each accommodation is displayed as a compact card.



Displayed fields:



\- Accommodation name

\- Type

\- Occupancy

\- Availability badge



Possible badges:



Available



Occupied



Arrival



Departure



Blocked



Out of Service



\---



\# 34. Availability Colors



Colors must be immediately recognizable.



Suggested semantic colors:



Green



Available



Blue



Arrival Today



Orange



Departure Today



Red



Occupied



Dark Gray



Out of Service



Colors are always accompanied by text.



Never rely only on color.



\---



\# 35. Accommodation Detail Preview



Touching an accommodation opens a lightweight popup.



Displayed:



Current guest



Arrival



Departure



Number of guests



Reservation source



Quick actions:



Open Room Detail



Close



\---



\# 36. Search



Search field at the top.



Searches:



Accommodation name



Guest name



Search updates instantly.



\---



\# 37. Filters



Optional filters.



Available



Occupied



Arrivals



Departures



Out of Service



Multiple filters may be active simultaneously.



\---



\# 38. Housekeeping Module



Purpose



Provide housekeeping staff with today's work.



The module focuses on tasks rather than rooms.



\---



\# 39. Housekeeping Landing Screen



Sections:



Ready to Clean



Currently Cleaning



Ready for Inspection



Completed Today



Rooms automatically move between sections.



\---



\# 40. Housekeeping Card



Each task card contains:



Accommodation



Guest status



Cleaning priority



Estimated cleaning duration (future)



Maintenance warning



Opening the card navigates directly to Room Detail.



\---



\# 41. Cleaning Priorities



Priority is automatically calculated.



Highest priority:



Guest arriving today



Then:



Dirty rooms



Then:



Remaining cleaning



Owners may manually override priority.



\---



\# 42. Maintenance Module



Purpose



Centralize all resort maintenance.



The module is task-oriented.



Not room-oriented.



\---



\# 43. Maintenance Dashboard



Sections:



Open Issues



In Progress



Waiting



Completed



Counters displayed at top.



Example:



Open (4)



Critical (1)



Completed Today (7)



\---



\# 44. Maintenance Card



Displays:



Accommodation



Issue title



Priority



Assigned technician



Creation date



Status



Photo indicator



Opening the card shows the full issue.



\---



\# 45. Maintenance Detail



Displays:



Issue description



Photos



Room



Reporter



Assigned technician



Current status



Comments (future)



Timeline (future)



Only current status is required for MVP.



\---



\# 46. Maintenance Workflow



Open



↓



Assigned



↓



In Progress



↓



Resolved



↓



Closed



Only one active state is allowed.



\---



\# 47. Procurement Module



Purpose



Collect internal supply requests.



This module is intentionally simple.



Inventory management is outside MVP scope.



\---



\# 48. Procurement Dashboard



Displays:



Pending Requests



Approved Requests



Completed Requests



Recent Requests



Requests are sorted by creation date.



Newest first.



\---



\# 49. Procurement Request Card



Fields:



Item



Requested quantity



Requester



Request date



Status



Priority



Touching the card opens the complete request.



\---



\# 50. Procurement Workflow



Requested



↓



Approved



↓



Purchased



↓



Delivered



↓



Closed



Each transition records timestamp and operator.



Historical analytics are outside MVP scope.

# 51. Internal Chat



\## Purpose



Replace operational communication currently handled through LINE.



The chat is designed exclusively for resort operations.



No customer communication is handled here.



\---



\# 52. Chat Philosophy



The chat is action-oriented.



It is not intended to become a generic messaging platform.



Whenever possible, conversations should be linked to operational entities.



Examples:



Room



Maintenance Issue



Procurement Request



Future Task



This allows users to understand the context immediately.



\---



\# 53. Chat Home



Displays recent conversations.



Each conversation shows:



\- Avatar

\- Name

\- Last message

\- Timestamp

\- Unread counter



Pinned conversations appear first.



Unread conversations are visually emphasized.



\---



\# 54. Conversation Types



The MVP supports:



Direct Messages



Group Chats



Future versions may introduce:



Room Chats



Maintenance Chats



Procurement Chats



These are intentionally excluded from MVP.



\---



\# 55. Conversation Screen



The conversation screen contains:



Header



Message List



Attachment Button



Message Input



Send Button



The message field expands automatically while typing.



\---



\# 56. Supported Attachments



MVP supports:



Photo



Camera



Future versions:



Video



Voice Notes



Documents



Location



These are intentionally excluded.



\---



\# 57. Message Types



Supported:



Plain Text



Image



System Message



Examples of system messages:



Room marked Ready



Maintenance Closed



New Procurement Request



These are automatically generated.



\---



\# 58. Notifications



Push notifications are enabled.



Notifications should include:



Sender



Short preview



Timestamp



Tapping the notification opens the conversation directly.



\---



\# 59. Notification Rules



Notify only users involved.



Avoid notification spam.



Multiple messages received within a short interval should be grouped.



Critical maintenance notifications always bypass grouping.



\---



\# 60. Search



Global search supports:



People



Messages



Room names



Search is incremental.



Results appear while typing.



\---



\# 61. User Profile



Minimal profile information.



Fields:



Photo



Name



Role



Language



Online status



Future:



Phone



Email



Department



\---



\# 62. Settings



The MVP includes only operational settings.



Language



Notifications



Dark Mode (future)



App Version



Logout



No advanced configuration.



\---



\# 63. Global Navigation



Bottom Navigation Bar.



Five primary tabs:



Dashboard



Rooms



Availability



Chat



More



No hidden navigation drawers.



No hamburger menu.



The application must remain usable with one hand.



\---



\# 64. Design Principles



The interface follows these principles:



Large touch targets



Minimal text



Strong visual hierarchy



Consistent spacing



High outdoor readability



Fast navigation



Every interactive element should clearly communicate its purpose.



\---



\# 65. Color System



Semantic colors only.



Success



Information



Warning



Danger



Neutral



No decorative colors.



Colors must reinforce meaning.



\---



\# 66. Typography



Typography hierarchy:



Page Title



Section Title



Card Title



Body



Caption



Avoid using more than two font families.



Readable under sunlight is the priority.



\---



\# 67. Icons



Icons must always be accompanied by labels.



Never rely solely on icon meaning.



Use a single icon library consistently across the application.



\---



\# 68. Buttons



Primary Button



Main action.



Secondary Button



Alternative action.



Danger Button



Destructive operations.



Disabled buttons should explain why they are unavailable whenever possible.



\---



\# 69. Forms



Forms should minimize typing.



Preference order:



Selection



Toggle



Buttons



Dropdown



Text Input



Free-text fields should be the last option.



\---



\# 70. Validation



Validation occurs immediately.



Errors are shown inline.



Never display multiple modal dialogs for validation.



Users should understand exactly how to resolve an error.



\---



\# 71. Offline Behaviour



Offline mode is NOT supported in the MVP.



If connectivity is lost:



Display a clear warning.



Prevent write operations.



Automatically recover when the connection returns.



No local synchronization logic is implemented.



\---



\# 72. Performance Requirements



Application startup:



Target < 2 seconds



Screen navigation:



Target < 300 ms perceived delay



Search results:



Target < 200 ms after input



Animations must never delay operational workflows.



\---



\# 73. Accessibility



Minimum touch target:



44 × 44 px



High contrast



Readable typography



Color-independent status indicators



Support for system font scaling where possible.



\---



\# 74. MVP Success Criteria



The MVP is considered successful if staff can perform daily resort operations without relying on LINE for operational coordination and without opening Beds24 for routine tasks such as room status, housekeeping progress, availability checks, maintenance reporting, and internal supply requests.



The application should reduce operational friction, centralize information, and provide a simple, fast, and reliable mobile experience suitable for continuous use throughout the working day.



\---



\# End of PRD\_002\_VANARA\_OPERATIONS

# 03\_SCREEN\_SPECIFICATIONS.md



\# Screen Specifications



Version 1.0



This document defines every screen of the Vanara Operations MVP.



The goal is to remove ambiguity during UI implementation.



\---



\# Design Principles



Every screen must follow these principles:



\- Mobile First

\- Thumb-friendly navigation

\- Maximum 2 taps to reach any operational action

\- Large touch areas

\- High contrast

\- Outdoor readability

\- No decorative UI

\- Fast rendering



\---



\# SCREEN 01 — Splash



Purpose



Load application.



Components



\- Logo

\- App name

\- Loading indicator



Behavior



Check authentication.



If authenticated:



→ Dashboard



Otherwise:



→ Login



Maximum duration:



2 seconds



\---



\# SCREEN 02 — Login



Purpose



Authenticate staff.



Components



Logo



Email



Password



Login button



Forgot password (future)



Behavior



Invalid credentials produce an inline error.



No modal dialog.



Successful login stores session securely.



\---



\# SCREEN 03 — Dashboard



Purpose



Application entry point.



Layout



Header



↓



Quick Summary



↓



Main Modules



↓



Recent Notifications



Bottom Navigation



\---



Header



Displays



Greeting



Current date



User name



Notification icon



Profile icon



\---



Quick Summary



Small operational cards.



Examples



Today's Arrivals



Today's Departures



Dirty Rooms



Maintenance Issues



Pending Procurement



Touching a card opens the related module.



\---



Main Modules



Displayed as a two-column grid.



Modules



Room Workspace



Arrivals



Housekeeping



Availability



Maintenance



Procurement



Chat



Cards are identical in size.



No scrolling should be required on modern devices.



\---



Recent Notifications



Displays latest operational events.



Examples



Room 4 marked Ready



Maintenance completed



New procurement request



Unread messages



Maximum:



5 items



Button



View All



\---



Bottom Navigation



Dashboard



Rooms



Availability



Chat



More



Current tab is always highlighted.



\---



Empty State



No notifications.



Display:



"No recent activity."



\---



Loading



Skeleton cards.



\---



Error



Unable to load dashboard.



Display retry button.



\---



\# SCREEN 04 — Room Workspace



Purpose



Provide a complete operational overview of all accommodations.



This is expected to become the most frequently used screen.



\---



Layout



Header



Search



Filters



Accommodation Grid



Bottom Navigation



\---



Header



Displays



Room Workspace



Total accommodations



Quick refresh icon



\---



Search



Supports



Accommodation name



Guest name



Instant filtering.



\---



Filters



Available



Occupied



Dirty



Cleaning



Ready



Maintenance



Out of Service



Multiple filters allowed.



\---



Accommodation Grid



Every accommodation is displayed using the same card.



Cards never change size.



\---



Card Layout



Photo



↓



Accommodation Name



↓



Occupancy Badge



↓



Cleaning Badge



↓



Maintenance Badge



↓



Guest Name (if occupied)



↓



Arrival / Departure indicator



\---



Touch Behaviour



Entire card is clickable.



One tap:



Open Room Detail.



No swipe actions.



No hidden actions.



\---



Badges



Occupancy



Occupied



Vacant



Arrival Today



Departure Today



Cleaning



Dirty



Cleaning



Ready



Maintenance



Warning



Critical



Out of Service



\---



Visual Priority



Critical maintenance always overrides cleaning color.



Example



Critical issue



\+



Ready room



Card border becomes red.



Cleaning badge remains green.



\---



Pull To Refresh



Supported.



\---



Loading



Skeleton cards.



\---



Empty State



No accommodations found.



\---



Error



Unable to load room list.



Retry button.



\---



\# SCREEN 05 — Room Detail



Purpose



Central operational screen.



Everything concerning one accommodation starts here.


# SCREEN 05 — Room Detail



\## Purpose



Provide a complete operational view of one accommodation.



Room Detail is the central entity screen of Vanara Operations.



All information and actions related to a room must be accessible from this screen without navigating through unrelated modules.



\---



\## Route



```text

/rooms/{roomId}

```



Examples:



```text

/rooms/bungalow-4

/rooms/villa-10

/rooms/tent-3

```



The route must be directly accessible from:



\* Room Workspace

\* Arrivals \& Departures

\* Housekeeping

\* Availability

\* Maintenance

\* Internal notifications

\* Search results



\---



\## Layout Structure



The screen uses a vertical mobile layout.



Order:



1\. Top Navigation

2\. Room Hero

3\. Operational Status

4\. Current Stay

5\. Housekeeping

6\. Maintenance

7\. Quick Actions

8\. Recent Operational Activity



The most frequently used information must appear before the user scrolls.



\---



\## Top Navigation



Components:



\* Back button

\* Accommodation name

\* More actions button



The back button returns to the previous operational context.



Example:



If opened from Housekeeping, return to Housekeeping.



If opened from Availability, return to Availability.



The application should preserve the previous list position and filters.



\---



\## Room Hero



Displays:



\* Main accommodation photo

\* Accommodation name

\* Accommodation type

\* Internal room number

\* Current availability state



Example:



```text

Bungalow 4

Standard Bungalow

Occupied

```



The image is informational.



It is not editable in the MVP.



If no image exists, display the accommodation type placeholder.



\---



\## Operational Status Panel



Displays three permanent status areas:



\### Occupancy



Possible values:



\* Vacant

\* Occupied

\* Arrival Today

\* Departure Today

\* Blocked



\### Housekeeping



Possible values:



\* Dirty

\* Cleaning

\* Ready

\* Inspection Required



`Inspection Required` is optional for the MVP and may be disabled through configuration.



\### Maintenance



Possible values:



\* Normal

\* Open Issue

\* Critical

\* Out of Service



Each status includes:



\* Icon

\* Text label

\* Semantic color



Do not use color alone.



\---



\## Out-of-Service Behaviour



If the room is marked Out of Service:



\* Display a prominent warning banner.

\* Keep the room visible in all operational lists.

\* Disable actions that would incorrectly mark it available.

\* Display the reason when available.

\* Display the responsible maintenance issue.

\* Allow authorized users to reopen the room.



Example banner:



```text

OUT OF SERVICE



Air-conditioning system requires repair.

```



\---



\## Current Stay Section



This section appears when an active or upcoming reservation exists.



Fields:



\* Guest name

\* Nationality

\* Check-in date

\* Check-out date

\* Number of nights

\* Adults

\* Children

\* Booking source

\* Reservation status

\* Expected arrival time

\* Expected departure time



Possible reservation statuses:



\* Confirmed

\* Arrival Today

\* Checked In

\* Departure Today

\* Checked Out

\* Cancelled

\* No Show



Reservation information is read-only in Vanara Operations.



Beds24 remains the reservation source of truth.



\---



\## No Active Stay



When no reservation exists, display:



```text

No active reservation for this accommodation.

```



Possible secondary information:



```text

Next arrival: 14 November

```



Do not display an empty card.



\---



\## Guest Information



Available guest information may include:



\* Full name

\* Nationality

\* Preferred language

\* Phone number

\* Number of guests

\* Special operational requests



Sensitive information should only appear when operationally necessary.



Passport images must not appear directly on the main screen.



If passport records are available, expose them through a specific authorized action.



\---



\## Housekeeping Panel



Displays:



\* Current cleaning status

\* Last status update

\* Staff member responsible

\* Primary housekeeping action

\* Optional checklist indicator



The primary action depends on the current state.



\### Dirty



Primary action:



```text

Start Cleaning

```



\### Cleaning



Primary action:



```text

Mark Ready

```



Secondary action:



```text

Report Problem

```



\### Ready



Primary action:



```text

Reopen Cleaning

```



This action requires confirmation.



\### Inspection Required



Primary action:



```text

Approve Room

```



Secondary action:



```text

Return to Cleaning

```



\---



\## Start Cleaning Action



When selected:



1\. Change status from Dirty to Cleaning.

2\. Record the current user.

3\. Record the timestamp.

4\. Update all connected screens.

5\. Display a confirmation toast.



Toast:



```text

Cleaning started for Bungalow 4.

```



No modal confirmation is required.



\---



\## Mark Ready Action



When selected:



1\. Open the Room Ready checklist.

2\. Require completion of mandatory checklist items.

3\. Save the checklist.

4\. Change the room status to Ready.

5\. Record user and timestamp.

6\. Update Room Workspace and Housekeeping.



If the checklist feature is disabled, status changes directly to Ready.



\---



\## Room Ready Checklist



The checklist should be simple and configurable.



Suggested default items:



\* Bed prepared

\* Bathroom cleaned

\* Towels provided

\* Drinking water provided

\* Amenities provided

\* Floor cleaned

\* Air-conditioning checked

\* Lights checked

\* Outdoor area checked

\* Room locked or prepared for arrival



Checklist items use large checkboxes.



Mandatory items must be visually identified.



The room cannot be marked Ready while required items remain incomplete.



\---



\## Checklist Warning



When attempting to submit an incomplete checklist:



```text

Complete all required checks before marking the room Ready.

```



Missing items should be highlighted inline.



Do not close the checklist.



\---



\## Reopen Cleaning



Used when a Ready room requires additional work.



Selecting the action opens a compact confirmation sheet.



Message:



```text

Move Bungalow 4 back to Dirty?

```



Optional reason:



\* Guest request

\* Inspection failed

\* Additional cleaning required

\* Other



The reason is optional in the MVP.



\---



\## Maintenance Panel



Displays active room-related maintenance issues.



Each issue shows:



\* Category

\* Short title

\* Priority

\* Current status

\* Assigned person

\* Created time



Issues are sorted by priority and age.



Critical issues appear first.



\---



\## No Maintenance Issues



Display:



```text

No open maintenance issues.

```



Provide action:



```text

Report Issue

```



\---



\## Report Issue Action



Opens the Create Maintenance Report screen as a bottom sheet or full-screen form.



Required fields:



\* Category

\* Priority

\* Description



Optional fields:



\* Photo

\* Assigned staff member

\* Mark room Out of Service



The form must support completion in less than 30 seconds.



\---



\## Quick Actions



The Quick Actions area displays context-sensitive actions.



Possible actions:



\* Report Maintenance Issue

\* Request Supplies

\* Open Internal Chat

\* View Reservation

\* View Passport Record

\* Mark Room Out of Service

\* Return Room to Service



Only actions available to the current role should be displayed.



Avoid showing disabled actions when they are not relevant.



\---



\## Recent Operational Activity



Displays recent significant changes related to the room.



Examples:



```text

10:42 — Nun marked room Ready

09:18 — Cleaning started

Yesterday — Maintenance issue reported

```



The MVP may limit this section to the most recent five events.



This is not intended to become a complete historical timeline.



Only operationally useful recent events should be retained.



\---



\## Loading State



Display:



\* Hero image placeholder

\* Status skeletons

\* Reservation skeleton

\* Action-button skeleton



The back button must remain usable.



\---



\## Error State



If Room Detail cannot load:



```text

Unable to load this accommodation.

```



Actions:



\* Retry

\* Return to Rooms



Do not display partially mismatched room data.



\---



\## Stale Data Warning



If the screen cannot refresh but cached data is visible:



```text

Information may be outdated.

Last updated at 10:42.

```



Write operations must be disabled until connectivity returns.



\---



\# SCREEN 06 — Arrivals \& Departures



\## Purpose



Provide a clear daily view of guests arriving and departing.



The screen is optimized for reception and housekeeping coordination.



\---



\## Route



```text

/movements

```



Optional selected date:



```text

/movements?date=2026-11-14

```



\---



\## Layout



1\. Header

2\. Date Selector

3\. Summary Counters

4\. Arrivals List

5\. Departures List

6\. Bottom Navigation



\---



\## Header



Displays:



\* Page title

\* Current selected date

\* Calendar button



Page title:



```text

Arrivals \& Departures

```



\---



\## Date Selector



Controls:



\* Previous day

\* Selected date

\* Next day

\* Open calendar



Default:



Today.



A Today shortcut appears when viewing another date.



\---



\## Summary Counters



Displays:



\* Arrivals

\* Departures

\* Staying Guests



Example:



```text

3 Arrivals

2 Departures

14 Staying Guests

```



Counters are informational.



\---



\## Arrivals List



Each arrival card contains:



\* Accommodation

\* Guest name

\* Nationality

\* Number of guests

\* Expected arrival time

\* Reservation status

\* Room readiness status



Room readiness must be highly visible.



Possible readiness labels:



\* Ready

\* Cleaning

\* Dirty

\* Out of Service



\---



\## Arrival Priority



Cards should be ordered by:



1\. Expected arrival time

2\. Unknown arrival time

3\. Accommodation number



If a guest is arriving soon and the room is not Ready, highlight the card.



Suggested warning condition:



Arrival expected within two hours and room is not Ready.



\---



\## Arrival Warning



Example:



```text

Guest arriving at 14:00.

Room is still being cleaned.

```



The warning should appear directly on the card.



\---



\## Arrival Card Actions



Tapping the card opens Room Detail.



Optional quick action:



```text

Open Room

```



Do not implement check-in editing in the MVP unless supported by the frozen backend.



\---



\## Departures List



Each departure card contains:



\* Accommodation

\* Guest name

\* Number of guests

\* Expected departure time

\* Departure status

\* Cleaning status after departure



Possible departure statuses:



\* Staying

\* Departure Today

\* Checked Out

\* Late Departure



\---



\## Unknown Times



If the arrival or departure time is unavailable, display:



```text

Time not provided

```



Never display `00:00` as a substitute.



\---



\## Empty State



No arrivals:



```text

No arrivals scheduled for this date.

```



No departures:



```text

No departures scheduled for this date.

```



Both sections remain visible.



\---



\## Loading State



Use skeleton reservation cards.



The date selector must remain visible.



\---



\## Error State



If reservation movements cannot load:



```text

Unable to load arrivals and departures.

```



Action:



```text

Retry

```



\---



\# SCREEN 07 — Housekeeping



\## Purpose



Provide housekeeping staff with a task-based view of rooms requiring attention.



\---



\## Route



```text

/housekeeping

```



\---



\## Layout



1\. Header

2\. Progress Summary

3\. Priority Task Section

4\. Cleaning Section

5\. Ready Section

6\. Bottom Navigation



\---



\## Header



Displays:



\* Housekeeping

\* Current date

\* Refresh action



\---



\## Progress Summary



Displays operational counts:



\* Dirty

\* Cleaning

\* Ready

\* Arrivals Pending



Example:



```text

4 Dirty

2 Cleaning

7 Ready

1 Arrival Pending

```



\---



\## Priority Task Section



Title:



```text

Priority Rooms

```



Includes rooms that:



\* Have an arrival today

\* Are not Ready

\* Have an urgent guest request

\* Were manually prioritized by an Owner



Priority cards display the reason.



Example:



```text

Priority: Guest arriving at 13:30

```



\---



\## Dirty Rooms Section



Contains rooms awaiting cleaning.



Each card displays:



\* Accommodation

\* Departure status

\* Next arrival

\* Priority

\* Maintenance warning

\* Start Cleaning button



\---



\## Cleaning Section



Contains rooms currently being cleaned.



Each card displays:



\* Accommodation

\* Assigned staff member

\* Cleaning start time

\* Maintenance warning

\* Open Room button



\---



\## Ready Section



Contains rooms completed today.



Each card displays:



\* Accommodation

\* Completed by

\* Completion time

\* Checklist completion indicator



This section may be collapsed by default.



\---



\## Start Cleaning



Action behaviour:



1\. Verify the room is still Dirty.

2\. Assign the current staff member.

3\. Change status to Cleaning.

4\. Record timestamp.

5\. Move card to Cleaning.

6\. Show success toast.



\---



\## Concurrent Update



If another staff member has already started cleaning:



```text

Cleaning was already started by Nun.

```



Refresh the card automatically.



Do not overwrite the existing assignment silently.



\---



\## Empty State



When all work is complete:



```text

All rooms are ready.

```



Optional supporting text:



```text

No housekeeping tasks are currently pending.

```



\---



\## Error State



Display cached room tasks when possible.



Show:



```text

Unable to refresh housekeeping tasks.

```



Disable status-changing actions until synchronization is restored.



\---



\# SCREEN 08 — Room Ready Checklist



\## Purpose



Confirm that a room is operationally prepared before its status changes to Ready.



\---



\## Presentation



Use a full-screen mobile form.



Avoid a small modal because checklist items may require scrolling.



\---



\## Header



Displays:



\* Close button

\* Accommodation name

\* Checklist title



Example:



```text

Bungalow 4

Room Ready Check

```



\---



\## Checklist Behaviour



Each item contains:



\* Checkbox

\* Short label

\* Optional help text



Checkboxes must have large tap targets.



Checking an item saves locally in the current form state.



The final submission writes the completed checklist.



\---



\## Required Items



Required items display:



```text

Required

```



The Submit button remains disabled until all required items are complete.



\---



\## Maintenance Discovery



Provide action:



```text

Report a Problem

```



This opens a maintenance form without losing checklist progress.



After the report is submitted, return to the checklist.



\---



\## Completion Action



Primary button:



```text

Mark Room Ready

```



After successful submission:



\* Close checklist

\* Return to previous screen

\* Update room state

\* Display confirmation toast



\---



\## Submission Failure



If submission fails:



```text

The checklist could not be saved.

Your selections have been preserved.

```



Actions:



\* Retry

\* Cancel



Do not clear the checklist selections.



\---



\# SCREEN 09 — Availability



\## Purpose



Allow staff to answer walk-in availability questions quickly.



The screen must provide a usable answer without opening Beds24.



\---



\## Route



```text

/availability

```



\---



\## Layout



1\. Header

2\. Date or Stay Selector

3\. Guest Count

4\. Search and Filters

5\. Availability Results

6\. Bottom Navigation



\---



\## Date Mode



The MVP should support at least a single-date view.



Preferred implementation:



\* Check-in date

\* Check-out date



When only one date is selected, treat it as an operational day view.



\---



\## Guest Count



Optional fields:



\* Adults

\* Children



These fields refine suitability.



They must not alter the Beds24 reservation system.



\---



\## Availability Result Card



Displays:



\* Accommodation name

\* Type

\* Availability

\* Maximum occupancy

\* Current operational status

\* Indicative price, only when reliable data is available



Possible statuses:



\* Available

\* Occupied

\* Partial Availability

\* Blocked

\* Out of Service

\* Unknown



\---



\## Source Integrity



Availability must never be inferred from housekeeping status alone.



A room can be Dirty but available for a future date.



A room can be Ready but occupied.



Reservation availability and operational readiness must remain distinct.



\---



\## Unknown Availability



If availability data cannot be confirmed:



```text

Availability could not be verified.

```



Do not show the room as available.



\---



\## Walk-In Support



Preferred quick action:



```text

Ask Waraporn

```



The action sends the selected dates, guest count, and current availability context to the staff assistant.



The returned answer should be concise and suitable for speaking directly to the guest.



\---



\## Availability Empty State



```text

No accommodation is available for the selected dates.

```



Provide actions:



\* Change dates

\* Clear filters



\---



\# SCREEN 10 — Maintenance Dashboard



\## Purpose



Provide a centralized list of all open maintenance work.



\---



\## Route



```text

/maintenance

```



\---



\## Layout



1\. Header

2\. Status Counters

3\. Search

4\. Filter Chips

5\. Issue List

6\. Create Issue Button

7\. Bottom Navigation



\---



\## Status Counters



Displays:



\* Open

\* In Progress

\* Critical

\* Completed Today



Counters are clickable filters.



\---



\## Filters



Supported filters:



\* Open

\* Assigned

\* In Progress

\* Waiting

\* Resolved

\* Critical

\* Room

\* Category

\* Assigned Person



The MVP may implement the most important filters first:



\* Open

\* In Progress

\* Critical

\* Resolved



\---



\## Maintenance Issue Card



Displays:



\* Room or location

\* Issue title

\* Category

\* Priority

\* Status

\* Assigned person

\* Time open

\* Photo indicator



Critical cards must be visually prominent.



\---



\## Floating Action Button



Action:



```text

Report Issue

```



Use only if it does not conflict with bottom navigation.



Alternative:



A permanent primary button below the header.



\---



\## Empty State



```text

No maintenance issues match these filters.

```



When no issues exist at all:



```text

No open maintenance issues.

```



\---



\# SCREEN 11 — Create Maintenance Report



\## Purpose



Allow any authorized staff member to report a resort problem quickly.



\---



\## Route



```text

/maintenance/new

```



May also open as a full-screen sheet from Room Detail.



\---



\## Fields



\### Location



Required.



Options may include:



\* Accommodation

\* Reception

\* Restaurant

\* Garden

\* Pool

\* Kitchen

\* Storage

\* Other



When opened from Room Detail, preselect the accommodation.



\### Category



Required.



Default categories:



\* Electrical

\* Air Conditioning

\* Plumbing

\* Bathroom

\* Furniture

\* Building

\* Garden

\* Equipment

\* Internet

\* Other



\### Priority



Required.



Options:



\* Low

\* Medium

\* High

\* Critical



\### Description



Required.



Plain text.



Suggested minimum:



Three characters.



\### Photo



Optional.



Sources:



\* Camera

\* Photo Library



Maximum number for MVP:



Three photos.



\### Assign To



Optional.



Selectable internal maintenance person.



\### Mark Out of Service



Visible only for accommodation issues and authorized roles.



\---



\## Submit Behaviour



On submit:



1\. Validate required fields.

2\. Upload photos.

3\. Create issue.

4\. Update related room status.

5\. Notify assigned or responsible users.

6\. Return to issue detail.

7\. Display success confirmation.



\---



\## Upload Failure



If a photo upload fails:



\* Preserve the form.

\* Allow retry.

\* Do not create a duplicate issue.



\---



\# SCREEN 12 — Maintenance Detail



\## Purpose



Display and update one maintenance issue.



\---



\## Route



```text

/maintenance/{issueId}

```



\---



\## Content



\* Issue title

\* Location

\* Priority

\* Status

\* Description

\* Photos

\* Reporter

\* Assigned person

\* Created time

\* Last updated time

\* Room impact

\* Current action



\---



\## Status Workflow



Supported states:



```text

Open

Assigned

In Progress

Waiting

Resolved

Closed

```



Only valid next actions should appear.



\---



\## Primary Actions by State



\### Open



\* Assign

\* Start Work



\### Assigned



\* Start Work

\* Reassign



\### In Progress



\* Mark Waiting

\* Resolve



\### Waiting



\* Resume Work

\* Resolve



\### Resolved



\* Close

\* Reopen



\### Closed



\* Reopen



\---



\## Internal Maintenance Escalation



The application follows this operational pattern:



1\. Report the issue.

2\. Assign or notify the internal maintenance person.

3\. Attempt internal resolution.

4\. If unresolved, expose the appropriate external technician contact.

5\. Record that external assistance is required.



The MVP does not need automated external dispatch.



It must make escalation information easy to access.



\---



\## External Contact Action



When available:



```text

Show External Technician

```



Displays:



\* Trade

\* Name

\* Phone number

\* Notes



Examples:



\* Electrician

\* Air-conditioning technician

\* Plumber



\---



\## Resolve Issue



Requires:



\* Resolution note

\* Optional photo

\* Confirmation whether the room can return to service



If the issue marked the room Out of Service, resolution must explicitly ask:



```text

Return this room to service?

```



\---



\# SCREEN 13 — Procurement Dashboard



\## Purpose



Provide a simple view of internal supply requests.



\---



\## Route



```text

/procurement

```



\---



\## Layout



1\. Header

2\. Status Counters

3\. Filter Chips

4\. Request List

5\. New Request Button

6\. Bottom Navigation



\---



\## Request Statuses



\* Requested

\* Approved

\* Purchased

\* Delivered

\* Closed

\* Rejected



`Rejected` may be excluded if the Owner prefers requests to be discussed rather than formally rejected.



\---



\## Request Card



Displays:



\* Item

\* Quantity

\* Requester

\* Request time

\* Priority

\* Status

\* Optional room or department



\---



\## Empty State



```text

No procurement requests.

```



\---



\# SCREEN 14 — Create Procurement Request



\## Purpose



Allow staff to request operational supplies with minimal typing.



\---



\## Fields



\### Item



Required.



Use a searchable predefined item list when possible.



Examples:



\* Drinking water

\* Toilet paper

\* Soap

\* Shampoo

\* Coffee

\* Tea

\* Towels

\* Bed linen

\* Cleaning product

\* Light bulb

\* Batteries

\* Other



\### Quantity



Required.



Numeric stepper preferred.



\### Unit



Examples:



\* Pieces

\* Bottles

\* Packs

\* Kilograms

\* Sets



\### Priority



\* Normal

\* Urgent



\### Needed For



Optional:



\* Room

\* Housekeeping

\* Reception

\* Restaurant

\* Maintenance

\* General



\### Note



Optional.



\---



\## Submission



After submission:



\* Create request

\* Notify Owners or designated purchasing users

\* Return to Procurement Dashboard

\* Display confirmation



Toast:



```text

Supply request submitted.

```



\---



\# SCREEN 15 — Procurement Detail



\## Purpose



Display and progress one supply request.



\---



\## Content



\* Requested item

\* Quantity and unit

\* Requester

\* Department or room

\* Priority

\* Note

\* Current status

\* Created time

\* Status actions



\---



\## Owner Actions



Depending on state:



\* Approve

\* Mark Purchased

\* Mark Delivered

\* Close Request



Staff users may have read-only access after submission.



\---



\# SCREEN 16 — Chat Home



\## Purpose



Provide access to internal operational conversations.



\---



\## Route



```text

/chat

```



\---



\## Layout



1\. Header

2\. Search

3\. Conversation List

4\. New Conversation Action

5\. Bottom Navigation



\---



\## Conversation Row



Displays:



\* Avatar

\* Person or group name

\* Last message preview

\* Timestamp

\* Unread badge

\* Pinned indicator



Unread messages use stronger typography.



\---



\## Conversation Sorting



Order:



1\. Pinned conversations

2\. Most recent unread

3\. Most recently active



\---



\## Empty State



```text

No conversations yet.

```



Action:



```text

Start Conversation

```



\---



\# SCREEN 17 — Conversation



\## Purpose



Support internal resort communication.



\---



\## Route



```text

/chat/{conversationId}

```



\---



\## Header



Displays:



\* Back

\* Conversation name

\* Member summary

\* More actions



\---



\## Message List



Supports:



\* Text messages

\* Images

\* System messages



Messages display:



\* Sender

\* Timestamp

\* Delivery state



Group consecutive messages from the same sender where appropriate.



\---



\## Composer



Components:



\* Attachment button

\* Expanding text field

\* Send button



The Send button is disabled when the message is empty and no attachment exists.



\---



\## Image Attachment



User can:



\* Take photo

\* Choose photo

\* Preview photo

\* Remove before sending

\* Add optional caption



\---



\## System Messages



System messages are visually distinct.



Examples:



```text

Nun marked Bungalow 4 Ready.

```



```text

Stefano created a critical maintenance issue.

```



System messages are not editable.



\---



\## Failed Message



Display failed state inline.



Action:



```text

Retry

```



Do not remove the message from the conversation.



\---



\# SCREEN 18 — Notifications



\## Purpose



Display operational notifications in one place.



\---



\## Route



```text

/notifications

```



\---



\## Notification Types



\* Arrival warning

\* Room not ready

\* Maintenance assignment

\* Critical maintenance

\* Procurement request

\* Chat message

\* System update



\---



\## Notification Row



Displays:



\* Type icon

\* Title

\* Supporting text

\* Timestamp

\* Read state



Tapping opens the relevant entity.



Examples:



\* Room Detail

\* Maintenance Detail

\* Procurement Detail

\* Conversation



\---



\## Notification Controls



\* Mark all as read

\* Open notification settings



Bulk deletion is not required for MVP.



\---



\# SCREEN 19 — More



\## Purpose



Provide access to secondary modules and settings.



\---



\## Route



```text

/more

```



\---



\## Menu Items



\* Housekeeping

\* Maintenance

\* Procurement

\* Arrivals \& Departures

\* Notifications

\* Ask Waraporn

\* Settings

\* Logout



The exact items depend on the final bottom-navigation composition.



\---



\# SCREEN 20 — Ask Waraporn



\## Purpose



Allow staff to ask operational questions using approved resort information.



\---



\## Route



```text

/assistant

```



\---



\## Primary Use Cases



Examples:



\* Is a bungalow available tonight?

\* What price should I tell a walk-in guest?

\* Which rooms are ready?

\* What time does a guest arrive?

\* What should I do for a late check-in?

\* Who should I call for an electrical problem?



The assistant should prioritize operational accuracy over conversational creativity.



\---



\## Layout



1\. Header

2\. Suggested Questions

3\. Conversation

4\. Input Composer



\---



\## Suggested Questions



Examples:



\* Availability tonight

\* Today’s arrivals

\* Rooms not ready

\* Maintenance contacts

\* Resort procedure



Suggested questions should adapt to the current screen context where possible.



\---



\## Answer Style



Answers should be:



\* Short

\* Operational

\* Direct

\* Based on current system data

\* Available in English or Thai



When data cannot be verified, the assistant must say so.



It must not invent availability, prices, reservation data, or policies.



\---



\## Cost Control



AI should be used selectively.



Prefer deterministic application data and predefined logic for:



\* Counts

\* Statuses

\* Availability results

\* Room lists

\* Reservation movements



Use AI mainly to:



\* Interpret natural-language questions

\* Summarize operational context

\* Translate or simplify an answer

\* Guide staff through procedures



\---



\# SCREEN 21 — Settings



\## Purpose



Provide minimal application preferences.



\---



\## Route



```text

/settings

```



\---



\## Settings



\* Language

\* Push Notifications

\* Notification Categories

\* App Installation Help

\* App Version

\* Privacy Information

\* Logout



\---



\## Language



Options:



\* English

\* Thai



Default:



Device language when supported.



The selected language overrides the device setting.



\---



\## Notification Categories



Users may enable or disable:



\* Chat

\* Arrivals

\* Housekeeping

\* Maintenance

\* Procurement



Critical maintenance cannot be fully disabled for Owners and designated responsible users.



\---



\# SCREEN 22 — Profile



\## Purpose



Display the authenticated user's basic information.



\---



\## Content



\* Profile photo

\* Name

\* Role

\* Language

\* Notification status

\* Logout



Editing staff identity is outside the MVP unless provided by the backend.



\---



\# SCREEN 23 — Global Search



\## Purpose



Find operational entities quickly.



\---



\## Searchable Entities



\* Accommodation

\* Guest

\* Maintenance issue

\* Procurement request

\* Staff member

\* Chat conversation



\---



\## Search Result Grouping



Results are grouped by type.



Example:



```text

Rooms

Guests

Maintenance

People

```



Tapping a result opens the relevant detail screen.



\---



\## Empty Search



Before typing, display recent or useful entities.



After no results:



```text

No matching results.

```



\---



\# Global Screen Rules



\## Navigation Preservation



When returning from a detail screen, preserve:



\* Scroll position

\* Search query

\* Selected filters

\* Selected date

\* Active tab



\---



\## Confirmation Dialogs



Use confirmation only for:



\* Destructive actions

\* Reopening completed work

\* Marking a room Out of Service

\* Returning a room to service

\* Logging out

\* Closing unresolved tasks



Do not ask for confirmation for routine forward actions.



\---



\## Toast Messages



Use toast messages for successful lightweight actions.



Examples:



\* Cleaning started

\* Room marked Ready

\* Request submitted

\* Issue assigned

\* Message sent



Toasts should disappear automatically and must not block the interface.



\---



\## Bottom Sheets



Use bottom sheets for:



\* Simple action selection

\* Filter selection

\* Confirmation

\* Camera or photo source

\* Quick status changes



Use full screens for:



\* Complex forms

\* Checklists

\* Detailed entity views



\---



\## Permission Errors



When the user lacks permission:



```text

You do not have permission to perform this action.

```



Do not display inaccessible destructive actions unless understanding their existence is operationally useful.



\---



\## Session Expiration



When authentication expires:



1\. Preserve the intended destination.

2\. Redirect to Login.

3\. After successful login, return to the original screen when safe.



Unsaved forms should warn the user before being discarded.



\---



\## Global Network Warning



When connectivity is lost, display a persistent compact banner:



```text

No internet connection. Updates are temporarily unavailable.

```



Write actions are disabled.



When connectivity returns:



```text

Connection restored.

```



Refresh affected operational data automatically.



\---



\# End of 03\_SCREEN\_SPECIFICATIONS.md


# ADDITION TO `02\_PRD\_VANARA\_OPERATIONS.md`



\## 17A. Operational Check-In and Check-Out Status



Beds24 remains the source of truth for reservation dates and reservation status.



However, Vanara Operations must maintain a separate operational stay status representing what has physically happened at the resort.



The operational status overrides date-based assumptions when determining whether an accommodation is currently:



\* Vacant

\* Occupied

\* Dirty

\* Ready for cleaning

\* Ready for a new guest



The system must not assume that a guest has arrived or departed only because the scheduled date or time has been reached.



\---



\## 17B. Operational Stay States



Supported operational stay states:



\* Expected

\* Checked In

\* Checked Out

\* No Show

\* Cancelled



\### Expected



The reservation exists in Beds24, but staff have not yet confirmed the guest's physical arrival.



The room must not be considered operationally occupied until check-in is confirmed, unless the guest was already checked in previously.



\### Checked In



The guest has physically arrived and staff have completed the operational check-in.



Once confirmed:



\* The accommodation becomes Occupied.

\* The reservation is treated as the active stay.

\* The Room Workspace must display the guest as currently staying.

\* Housekeeping actions that would incorrectly treat the room as vacant must be disabled.

\* The operational state overrides scheduled arrival time or date assumptions.



\### Checked Out



The guest has physically left the accommodation and staff have completed the operational check-out.



Once confirmed:



\* The accommodation becomes Vacant.

\* The housekeeping status becomes Dirty.

\* A housekeeping task is created or activated immediately.

\* The room becomes visible in the Dirty Rooms section.

\* The room is not considered Ready or sellable from an operational perspective until cleaning is completed.

\* If another arrival is scheduled soon, the room receives an elevated housekeeping priority.



\### No Show



The expected guest did not arrive.



The accommodation must not become Occupied.



The reservation remains visible for operational review according to the data received from Beds24.



\### Cancelled



The reservation is cancelled.



No operational occupancy is created.



\---



\## 17C. Beds24 Data Versus Operational State



The application must distinguish between:



\### Reservation State



Provided by Beds24.



Examples:



\* Confirmed

\* Cancelled

\* Check-in date

\* Check-out date

\* Booking source



\### Operational State



Controlled by Vanara Operations.



Examples:



\* Guest has physically checked in

\* Guest has physically checked out

\* Room is currently occupied

\* Room is vacant and dirty

\* Room is ready



Operational state must take precedence when calculating current physical room status.



Example:



A reservation has a scheduled check-out date of today.



Until staff select `Check-Out Complete`, the room remains Occupied.



Example:



A reservation has a scheduled check-in date of today.



Until staff select `Check-In Complete`, the guest remains Expected and the room is not considered physically occupied.



\---



\## 17D. Check-In Completion



For every arrival scheduled for the selected date, authorized staff must see a simple action:



```text

Check-In Complete

```



When selected:



1\. Verify that the reservation is still valid.

2\. Record the operational check-in.

3\. Record the staff member.

4\. Record the exact timestamp.

5\. Change the accommodation occupancy state to Occupied.

6\. Set the reservation operational state to Checked In.

7\. Update Room Workspace.

8\. Update Room Detail.

9\. Update Availability.

10\. Update Arrivals \& Departures.

11\. Remove any outstanding arrival warning.

12\. Display a success confirmation.



Example confirmation:



```text

Check-in completed for Bungalow 4.

```



Routine check-in completion should not require a confirmation dialog.



\---



\## 17E. Check-Out Completion



For every departure scheduled for the selected date, authorized staff must see a simple action:



```text

Check-Out Complete

```



When selected:



1\. Record the operational check-out.

2\. Record the staff member.

3\. Record the exact timestamp.

4\. Change the accommodation occupancy state to Vacant.

5\. Change housekeeping status to Dirty.

6\. Create or activate a housekeeping task.

7\. Recalculate housekeeping priority.

8\. Update Room Workspace.

9\. Update Room Detail.

10\. Update Availability.

11\. Update Arrivals \& Departures.

12\. Notify housekeeping when appropriate.

13\. Display a success confirmation.



Example confirmation:



```text

Check-out completed. Bungalow 4 is now vacant and Dirty.

```



\---



\## 17F. Immediate Arrival After Departure



When a room has a departure and a new arrival on the same date, the application must identify it as a same-day turnover.



After operational check-out:



\* The room becomes Vacant and Dirty.

\* The housekeeping task becomes high priority.

\* The next arrival time must be displayed on the housekeeping card.

\* The room must not be displayed as Ready until the cleaning workflow is completed.

\* Staff should receive a visible warning when the next arrival is imminent.



Example:



```text

Priority turnover

Next guest arriving at 14:00

```



Suggested priority rule:



\* Critical cleaning priority when arrival is within two hours.

\* High priority when arrival is later on the same day.

\* Normal priority when no same-day arrival exists.



Exact thresholds should be configurable.



\---



\## 17G. Reversing an Operational Action



Authorized users must be able to correct an accidental check-in or check-out.



Possible correction actions:



\* Undo Check-In

\* Undo Check-Out



These actions require confirmation.



Every correction must record:



\* Previous state

\* New state

\* User

\* Timestamp

\* Optional reason



Undo Check-Out must restore the previous occupancy and housekeeping states when technically safe.



If cleaning has already started or another reservation has been operationally checked in, the correction must be blocked and escalated to an Owner.



\---



\# ADDITION TO `03\_SCREEN\_SPECIFICATIONS.md`



\## SCREEN 06 — Arrivals \& Departures



\### Operational Completion Actions



Each arrival and departure card must include a clear operational completion action.



These actions represent the guest's physical arrival or departure and are separate from the scheduled reservation dates received from Beds24.



\---



\## Arrival Card State



Before physical arrival:



```text

Expected

```



Primary action:



```text

Check-In Complete

```



After selection:



\* Change operational reservation state to Checked In.

\* Change room occupancy to Occupied.

\* Replace the action button with a completed status.

\* Show the exact completion time and staff member.



Example:



```text

Checked in at 14:18 by Reception

```



The completed card remains visible in today's Arrivals list.



\---



\## Departure Card State



Before physical departure:



```text

Departure Expected

```



Primary action:



```text

Check-Out Complete

```



After selection:



\* Change operational reservation state to Checked Out.

\* Change occupancy to Vacant.

\* Change housekeeping status to Dirty.

\* Create or activate the housekeeping task.

\* Show the completion time and staff member.



Example:



```text

Checked out at 10:07 by Nun

Room status: Dirty

```



The completed card remains visible in today's Departures list.



\---



\## Arrival Card Layout



Each arrival card contains:



\* Accommodation

\* Guest name

\* Nationality

\* Guest count

\* Expected arrival time

\* Reservation status from Beds24

\* Operational arrival status

\* Room readiness status

\* `Check-In Complete` button



The button must be large enough for quick use on a mobile device.



\---



\## Departure Card Layout



Each departure card contains:



\* Accommodation

\* Guest name

\* Expected departure time

\* Reservation status from Beds24

\* Operational departure status

\* Next arrival information

\* `Check-Out Complete` button



When another guest arrives on the same day, display:



```text

Same-day turnover

Next arrival at 14:00

```



\---



\## Check-In Complete Button Behaviour



The button is visible only when:



\* The reservation is valid.

\* The operational status is not already Checked In.

\* The reservation has not been cancelled.

\* The user has permission to complete check-in.



After selection, show a loading state inside the button.



Prevent duplicate submissions.



On success, update the card immediately.



\---



\## Check-Out Complete Button Behaviour



The button is visible only when:



\* The guest is operationally Checked In, or an authorized correction workflow permits completion.

\* The operational status is not already Checked Out.

\* The user has permission to complete check-out.



After selection, show a loading state inside the button.



Prevent duplicate submissions.



On success, update the departure card and connected housekeeping state immediately.



\---



\## Housekeeping Trigger



Operational check-out must trigger housekeeping automatically.



The generated task contains:



\* Accommodation

\* Dirty status

\* Check-out completion time

\* Next arrival date

\* Next arrival time

\* Calculated priority

\* Guest departure indicator



If the room has a same-day arrival, display it at the top of the Housekeeping Priority Rooms section.



\---



\## Occupancy Calculation Rule



The Room Workspace must calculate occupancy using operational state first.



Priority order:



1\. Active operational Checked In state

2\. Active operational Checked Out state

3\. Beds24 reservation schedule

4\. Housekeeping and maintenance state



Examples:



\* Beds24 departure date is today, but no operational check-out exists: Occupied.

\* Operational check-out exists: Vacant and Dirty.

\* Beds24 arrival date is today, but no operational check-in exists: Expected, not yet Occupied.

\* Operational check-in exists: Occupied.



\---



\## Availability Impact



Operational check-out means the previous guest no longer occupies the room.



However, the room must not be shown as operationally ready for a new guest until housekeeping status becomes Ready.



Availability results should therefore distinguish:



\* Reservation Available

\* Operationally Dirty

\* Cleaning

\* Ready

\* Out of Service



Example:



```text

Available after cleaning

```



This state means there is no active occupying guest, but the room is not yet ready to receive another guest.



\---



\## Notifications



After check-out completion, notify the relevant housekeeping users when:



\* The room is Dirty.

\* A same-day arrival exists.

\* The next arrival is imminent.



Suggested notification:



```text

Bungalow 4 checked out.

Cleaning required before the 14:00 arrival.

```



Do not notify the entire staff unless required by role configuration.



\---



\## Error Handling



If operational check-in fails:



```text

Check-in could not be completed.

The room status has not changed.

```



If operational check-out fails:



```text

Check-out could not be completed.

No housekeeping task was created.

```



The action button must return to its previous state and allow retry.



Never update only part of the connected operational state.







<!-- ====================================================== -->

# SOURCE: 04_USER_FLOWS(1).md


# 04_USER_FLOWS.md

## Vanara Operations — User Flows

Version: 1.0  
Status: Implementation Draft  
Language: English

---

# 1. Purpose

This document defines the end-to-end user flows of the Vanara Operations MVP.

It complements the Product Requirements Document and Screen Specifications by describing:

- how users enter each workflow;
- which decisions the application makes;
- which state transitions occur;
- which connected modules must update;
- how errors and conflicting actions are handled.

The flows are written to support frontend, backend, QA, and acceptance testing.

---

# 2. Global Flow Rules

## 2.1 Source-of-Truth Separation

Vanara Operations must distinguish between:

### Reservation Data

Received from Beds24.

Examples:

- reservation dates;
- guest identity;
- booking source;
- booked accommodation;
- cancellation state;
- expected arrival and departure.

### Operational Data

Recorded inside Vanara Operations.

Examples:

- physical check-in completed;
- physical check-out completed;
- room currently occupied;
- room Dirty, Cleaning, or Ready;
- maintenance state;
- assigned staff member;
- operational timestamps.

Operational data takes precedence when determining the current physical condition of a room.

Beds24 data must not be overwritten locally. Vanara Operations adds an operational layer on top of it.

---

## 2.2 Transaction Integrity

Actions affecting multiple modules must be atomic.

Example: completing a check-out must not mark the reservation Checked Out while failing to create the housekeeping task.

The operation either completes fully or leaves every connected state unchanged.

---

## 2.3 Duplicate Protection

Every write action must prevent duplicate submissions.

During submission:

- disable the action button;
- show progress within the button;
- ignore repeated taps;
- use an idempotency key or equivalent backend protection.

---

## 2.4 Real-Time Propagation

After a successful operational action, all connected screens must update immediately or on the next automatic refresh.

Affected modules may include:

- Dashboard;
- Arrivals & Departures;
- Room Workspace;
- Room Detail;
- Housekeeping;
- Availability;
- Maintenance;
- Notifications;
- Ask Waraporn.

---

## 2.5 Permission Handling

When an action is unavailable because of role permissions:

- hide it when it has no operational value;
- display it disabled only when staff need to understand that the action exists;
- never allow the frontend alone to enforce permission;
- show a clear permission error if the backend rejects the action.

---

# 3. Authentication Flow

## Actors

- Owner
- Reception
- Housekeeping
- Maintenance

## Entry Point

Application launch.

## Main Flow

1. User opens the PWA.
2. Application displays the splash screen.
3. Application checks for a valid authenticated session.
4. If valid, the user is sent to the Dashboard.
5. If invalid or expired, the user is sent to Login.
6. User enters credentials.
7. Application validates the form.
8. Credentials are submitted.
9. Backend authenticates the user.
10. Application stores the secure session.
11. User is sent to the Dashboard or the originally requested route.

## Invalid Credentials

1. Backend rejects the credentials.
2. Login screen remains open.
3. Password field is preserved or cleared according to security policy.
4. Inline error appears:

> Email or password is incorrect.

## Session Expiration

1. A protected request returns an authentication error.
2. Unsaved forms are preserved when technically possible.
3. User is redirected to Login.
4. After successful login, the application returns to the original safe destination.

---

# 4. Daily Dashboard Flow

## Actor

Any authenticated staff member.

## Entry Point

Successful login or Dashboard tab.

## Main Flow

1. Application loads current operational data.
2. Dashboard displays role-relevant summary cards.
3. User sees:
   - arrivals today;
   - departures today;
   - rooms requiring cleaning;
   - open maintenance issues;
   - pending procurement requests;
   - unread messages or notifications.
4. User taps a summary card or module shortcut.
5. Application opens the corresponding filtered screen.

## Role Adaptation

### Housekeeping

Prioritize:

- Dirty rooms;
- Cleaning tasks;
- arrival rooms not Ready.

### Maintenance

Prioritize:

- assigned issues;
- Critical issues;
- rooms Out of Service.

### Reception

Prioritize:

- arrivals;
- departures;
- availability;
- rooms not Ready for imminent arrivals.

### Owner

Display all operational modules.

---

# 5. Arrival Review Flow

## Actor

Reception or Owner.

## Entry Points

- Dashboard arrivals card;
- Arrivals & Departures module;
- notification;
- selected calendar date.

## Main Flow

1. User opens Arrivals & Departures.
2. Application defaults to today.
3. Arrival cards are loaded from Beds24 reservation data plus Vanara operational state.
4. Cards are sorted by expected arrival time.
5. Each card displays:
   - accommodation;
   - guest name;
   - guest count;
   - expected arrival time;
   - reservation status;
   - operational arrival status;
   - room readiness;
   - same-day turnover warning where applicable.
6. User reviews the arrival.
7. User may open Room Detail or complete check-in.

## Imminent Arrival Warning

If the guest is expected within the configured threshold and the room is not Ready:

1. Arrival card becomes visually prominent.
2. Housekeeping priority is recalculated.
3. Relevant housekeeping users receive a notification.
4. Dashboard warning count updates.

---

# 6. Operational Check-In Flow

## Actor

Reception or another authorized user.

## Preconditions

- Reservation exists.
- Reservation is not cancelled.
- Operational state is not already Checked In.
- Accommodation is not occupied by another active operational stay.
- User has permission.

## Entry Points

- Arrival card;
- Room Detail;
- reservation context action.

## Main Flow

1. User taps **Check-In Complete**.
2. Button enters loading state.
3. Application revalidates the reservation and room state.
4. Backend records:
   - operational state = Checked In;
   - check-in timestamp;
   - staff user;
   - reservation reference;
   - accommodation reference.
5. Accommodation occupancy becomes Occupied.
6. Current guest becomes the active operational stay.
7. Arrival warnings are cleared.
8. Connected modules update.
9. Card displays:

> Checked in at 14:18 by Reception

10. Success toast appears.

## No Confirmation Dialog

Routine check-in completion must not require a confirmation dialog.

## Conflict: Room Already Occupied

1. Backend detects another active stay.
2. Check-in is rejected.
3. No state changes are written.
4. User sees:

> Check-in cannot be completed because this room is already marked Occupied.

5. Owner or authorized user must resolve the conflict.

## Conflict: Room Not Ready

The application should warn but not necessarily block check-in.

Suggested behavior:

1. Display warning:

> This room is currently Dirty. Continue with check-in?

2. Authorized user confirms or cancels.
3. If confirmed, room becomes Occupied while housekeeping status remains recorded for audit and operational follow-up.
4. A high-priority operational warning is created.

This rule should be configurable.

## Duplicate Submission

If the action was already completed by another user:

1. Backend returns the current state.
2. UI refreshes the card.
3. User sees:

> Check-in was already completed by Reception at 14:18.

---

# 7. Undo Check-In Flow

## Actor

Owner or authorized Reception user.

## Preconditions

- Operational state is Checked In.
- No operational check-out exists.
- No conflicting newer stay exists.

## Main Flow

1. User selects **Undo Check-In**.
2. Confirmation dialog appears.
3. User may provide an optional reason.
4. Backend validates that reversal is safe.
5. Operational state returns to Expected.
6. Room occupancy is recalculated.
7. User, timestamp, previous state, and reason are recorded.
8. Connected screens update.

## Blocked Reversal

Undo is blocked when:

- a check-out was already completed;
- another reservation has been checked in;
- the original reservation is no longer valid;
- reversal would create an inconsistent occupancy state.

---

# 8. Departure Review Flow

## Actor

Reception, Housekeeping, or Owner according to permissions.

## Entry Points

- Dashboard departures card;
- Arrivals & Departures module;
- Room Detail;
- notification.

## Main Flow

1. User opens today's departures.
2. Application loads expected departures from Beds24.
3. Operational state determines whether the guest is still physically in the room.
4. Each departure card shows:
   - room;
   - guest;
   - expected departure time;
   - operational departure state;
   - next arrival;
   - same-day turnover warning;
   - Check-Out Complete action.
5. Until staff complete check-out, the room remains Occupied.

---

# 9. Operational Check-Out Flow

## Actor

Authorized Reception, Housekeeping, or Owner user.

## Preconditions

- Guest is operationally Checked In, or an authorized exceptional workflow applies.
- Operational state is not already Checked Out.
- User has permission.

## Main Flow

1. User taps **Check-Out Complete**.
2. Button enters loading state.
3. Backend validates the current stay.
4. Backend performs one atomic operation:
   - operational stay becomes Checked Out;
   - exact timestamp is recorded;
   - staff user is recorded;
   - room occupancy becomes Vacant;
   - housekeeping status becomes Dirty;
   - housekeeping task is created or reactivated;
   - next arrival is identified;
   - priority is calculated;
   - notifications are generated when required.
5. Departure card updates immediately.
6. Room Workspace shows Vacant + Dirty.
7. Housekeeping displays the new task.
8. Availability shows the room as physically vacant but not Ready.
9. Success message appears:

> Check-out completed. Bungalow 4 is now vacant and Dirty.

## Same-Day Turnover

If another guest arrives that day:

1. Housekeeping task is marked High priority.
2. If arrival is within the urgent threshold, priority becomes Critical.
3. Next arrival time appears on the cleaning card.
4. Housekeeping users are notified.
5. Dashboard highlights the turnover.

## No Upcoming Arrival

If no same-day arrival exists:

- room becomes Dirty;
- housekeeping task receives normal priority;
- no urgent notification is required.

## Failure

If any connected operation fails:

1. Entire transaction is rolled back.
2. Room remains Occupied.
3. No orphan housekeeping task is created.
4. User sees:

> Check-out could not be completed. The room status has not changed.

---

# 10. Undo Check-Out Flow

## Actor

Owner or specifically authorized user.

## Preconditions

Reversal is safe only when:

- no new guest has been checked in;
- cleaning has not meaningfully progressed, or the workflow supports reversal;
- no conflicting reservation state exists.

## Main Flow

1. User selects **Undo Check-Out**.
2. Confirmation dialog explains the impact.
3. User provides an optional reason.
4. Backend validates safety.
5. Previous operational occupancy is restored.
6. Housekeeping task is cancelled or reverted.
7. Previous housekeeping state is restored where possible.
8. Correction is logged.
9. Connected modules update.

## Unsafe Reversal

If cleaning already started or another guest checked in:

1. Reversal is blocked.
2. User sees:

> Check-out cannot be undone because later operational activity already exists.

3. Owner must resolve the state manually through an administrative correction workflow.

---

# 11. Housekeeping Task Creation Flow

## Automatic Entry Point

Operational check-out completed.

## Manual Entry Point

Authorized user reopens a Ready room or marks a vacant room Dirty.

## Main Flow

1. Application creates or reactivates one housekeeping task for the room.
2. Duplicate open tasks for the same cleaning cycle are prevented.
3. Task stores:
   - room;
   - trigger type;
   - creation time;
   - previous guest departure time;
   - next arrival date and time;
   - priority;
   - current status = Dirty.
4. Task appears in Housekeeping.
5. Dashboard counts update.
6. Notifications are sent according to urgency.

---

# 12. Start Cleaning Flow

## Actor

Housekeeping or authorized staff.

## Preconditions

- Room housekeeping state is Dirty.
- No other user has already started the same task.

## Entry Points

- Housekeeping task card;
- Room Detail.

## Main Flow

1. User taps **Start Cleaning**.
2. Backend verifies task state.
3. Task becomes Cleaning.
4. Current user becomes assigned cleaner.
5. Start timestamp is recorded.
6. Room card updates.
7. Task moves to the Cleaning section.
8. Success toast appears.

## Concurrent Start

If another staff member already started:

1. Backend rejects duplicate assignment.
2. UI refreshes.
3. User sees:

> Cleaning was already started by Nun.

---

# 13. Report Problem During Cleaning Flow

## Actor

Housekeeping.

## Entry Point

Room Ready checklist or Room Detail.

## Main Flow

1. User selects **Report a Problem**.
2. Maintenance form opens with room preselected.
3. Existing checklist progress is preserved.
4. User selects category and priority.
5. User enters a short description.
6. User optionally takes photos.
7. User submits the issue.
8. Maintenance task is created.
9. User returns to the checklist or Room Detail.
10. If issue is Critical or makes the room unusable:
    - room is marked Out of Service or requires Owner confirmation;
    - housekeeping completion is blocked when appropriate;
    - arrival warnings update.

---

# 14. Mark Room Ready Flow

## Actor

Housekeeping or authorized inspector.

## Preconditions

- Room is in Cleaning or Inspection Required state.
- Mandatory checklist items are complete.
- No blocking maintenance issue exists.

## Main Flow

1. User selects **Mark Ready**.
2. Room Ready checklist opens.
3. User completes required checks.
4. User submits the checklist.
5. Backend validates:
   - mandatory items;
   - current cleaning state;
   - blocking maintenance state.
6. Checklist is saved.
7. Housekeeping status becomes Ready.
8. Completion user and timestamp are recorded.
9. Housekeeping task closes for the current cleaning cycle.
10. Connected screens update.
11. Arrival warning clears when applicable.
12. Success toast appears.

## Blocking Maintenance Issue

If a Critical issue or Out-of-Service state exists:

1. Submission is blocked.
2. User sees the blocking issue.
3. Room remains Cleaning or Inspection Required.

---

# 15. Reopen Cleaning Flow

## Actor

Authorized Housekeeping, Reception, or Owner user.

## Preconditions

Room is Ready.

## Main Flow

1. User selects **Reopen Cleaning**.
2. Confirmation sheet appears.
3. User optionally selects a reason.
4. Room becomes Dirty.
5. New housekeeping task or cleaning cycle is created.
6. Previous checklist remains stored but no longer represents current readiness.
7. Dashboard and arrival warnings update.

---

# 16. Housekeeping Priority Calculation Flow

## Trigger Events

Priority is recalculated when:

- check-out is completed;
- next arrival time changes;
- a room is reopened;
- a maintenance issue affects readiness;
- an Owner manually changes priority;
- current time enters an urgency threshold.

## Suggested Priority Rules

### Critical

- next arrival within two hours;
- room still Dirty or Cleaning;
- urgent Owner override.

### High

- same-day arrival exists;
- next arrival is later than two hours;
- important guest request exists.

### Normal

- no same-day arrival;
- no manual priority.

Manual Owner priority overrides calculated priority until removed.

---

# 17. Availability Search Flow

## Actor

Reception or Owner.

## Entry Points

- Availability tab;
- Dashboard;
- Ask Waraporn contextual action.

## Main Flow

1. User opens Availability.
2. User selects check-in and check-out dates.
3. User optionally enters adults and children.
4. Application requests reservation availability.
5. Beds24 reservation data determines whether the room can be sold for the selected dates.
6. Vanara operational state adds current physical readiness information.
7. Results distinguish:
   - available and Ready;
   - available but Dirty;
   - available and Cleaning;
   - occupied;
   - blocked;
   - Out of Service;
   - unknown.
8. User may open Room Detail or Ask Waraporn.

## Important Rule

Operational cleanliness must never be used as the only source for reservation availability.

Likewise, reservation availability must never imply that the room is currently Ready.

## Unknown Data

When the system cannot verify availability:

- do not present the room as available;
- display an Unknown state;
- allow retry.

---

# 18. Ask Waraporn Availability Flow

## Actor

Reception or other staff assisting a walk-in guest.

## Main Flow

1. User opens Availability.
2. User selects dates and guest count.
3. User taps **Ask Waraporn**.
4. Application sends structured availability context to the assistant.
5. Deterministic reservation and room data are retrieved before AI generation.
6. AI produces a short operational answer.
7. Answer includes only verified accommodation and price information.
8. If price or availability cannot be verified, the answer explicitly states this.

## Example Output

> Bungalow 4 is available tonight for two guests, but it is currently being cleaned. Please wait for Ready status before confirming immediate access.

## Prohibited Behavior

The assistant must not invent:

- availability;
- price;
- room readiness;
- guest details;
- resort policy.

---

# 19. Create Maintenance Issue Flow

## Actor

Any authorized staff member.

## Entry Points

- Maintenance Dashboard;
- Room Detail;
- Room Ready checklist;
- Out-of-Service workflow.

## Main Flow

1. User opens Create Maintenance Report.
2. Location is selected or prefilled.
3. User selects category.
4. User selects priority.
5. User writes a short description.
6. User optionally adds up to three photos.
7. User optionally assigns internal maintenance staff.
8. Authorized users may mark the room Out of Service.
9. User submits.
10. Backend uploads attachments and creates one issue.
11. Assigned users are notified.
12. Room maintenance status updates.
13. User is sent to Maintenance Detail.

## Photo Upload Failure

1. Form data remains preserved.
2. User may retry upload.
3. Duplicate issue creation is prevented.

---

# 20. Maintenance Assignment Flow

## Actor

Owner, Reception, or maintenance coordinator according to permissions.

## Main Flow

1. User opens an Open issue.
2. User selects **Assign**.
3. Internal staff member is selected.
4. Issue becomes Assigned.
5. Assignment timestamp is recorded.
6. Assigned person receives a notification.
7. Issue appears in their relevant maintenance view.

---

# 21. Start Maintenance Work Flow

## Actor

Assigned maintenance user or authorized staff.

## Main Flow

1. User opens an Assigned or Open issue.
2. User selects **Start Work**.
3. Issue becomes In Progress.
4. Start timestamp and user are recorded.
5. Connected room state remains unchanged unless issue severity requires Out of Service.

---

# 22. Maintenance Escalation Flow

## Purpose

Escalate unresolved work from the internal maintenance person to an external specialist.

## Main Flow

1. Internal maintenance user evaluates or attempts repair.
2. User determines external assistance is required.
3. Issue is moved to Waiting or a dedicated External Support Required flag is enabled.
4. Application shows the appropriate external contact based on category.
5. Authorized user contacts the technician outside the application.
6. User records a short note:
   - contact attempted;
   - appointment or expected visit;
   - external technician name.
7. Issue remains operationally open.
8. Relevant users are notified.

## External Contact Types

Examples:

- electrician;
- air-conditioning technician;
- plumber;
- internet technician;
- appliance repair.

The MVP does not automatically dispatch external technicians.

---

# 23. Resolve Maintenance Issue Flow

## Actor

Maintenance user or authorized Owner.

## Preconditions

Issue is In Progress or Waiting.

## Main Flow

1. User selects **Resolve**.
2. User enters a resolution note.
3. User optionally adds a completion photo.
4. If the room is Out of Service, application asks whether it can return to service.
5. Backend records resolution.
6. Issue becomes Resolved.
7. Room maintenance state is recalculated.
8. If returned to service, housekeeping readiness remains separate.
9. Relevant users are notified.

## Important Rule

Resolving maintenance does not automatically mark a Dirty room Ready.

---

# 24. Close Maintenance Issue Flow

## Actor

Owner or authorized user.

## Main Flow

1. User reviews a Resolved issue.
2. User selects **Close**.
3. Issue becomes Closed.
4. Closure user and timestamp are recorded.
5. Issue leaves active maintenance lists.
6. Minimal history remains accessible where required.

---

# 25. Mark Room Out of Service Flow

## Actor

Owner or authorized senior staff.

## Entry Points

- Room Detail;
- Create Maintenance Report;
- Maintenance Detail.

## Main Flow

1. User selects **Mark Out of Service**.
2. Confirmation dialog explains the operational impact.
3. User selects or links a maintenance reason.
4. Room becomes Out of Service.
5. Availability excludes the room from usable results.
6. Room Workspace displays the critical state.
7. Arrival conflicts are highlighted.
8. Owners and relevant operational users are notified.

## Existing or Upcoming Reservation Conflict

If an active or imminent reservation exists:

1. Application warns the user before confirmation.
2. The action may still proceed for safety.
3. A high-priority Owner alert is generated.
4. The system does not automatically move the reservation.

---

# 26. Return Room to Service Flow

## Actor

Owner or authorized user.

## Preconditions

- blocking maintenance issue is resolved or explicitly overridden;
- no unresolved Critical issue remains.

## Main Flow

1. User selects **Return to Service**.
2. Backend validates blocking issues.
3. Room leaves Out-of-Service state.
4. Reservation availability becomes eligible for recalculation.
5. Housekeeping status remains unchanged.
6. If room is Dirty, cleaning is still required.
7. Connected screens update.

---

# 27. Create Procurement Request Flow

## Actor

Authorized staff.

## Entry Points

- Procurement Dashboard;
- Room Detail;
- operational shortcut.

## Main Flow

1. User opens Create Procurement Request.
2. User searches or selects an item.
3. User enters quantity.
4. User selects unit.
5. User selects Normal or Urgent priority.
6. User optionally selects room or department.
7. User optionally adds a note.
8. User submits.
9. Request becomes Requested.
10. Owners or purchasing users are notified.
11. User sees confirmation.

---

# 28. Approve Procurement Request Flow

## Actor

Owner or designated purchasing user.

## Main Flow

1. User opens a Requested item.
2. User reviews quantity, requester, and reason.
3. User selects **Approve**.
4. Request becomes Approved.
5. Approval user and timestamp are recorded.
6. Requester may receive a notification.

## Optional Rejection

If enabled:

1. User selects Reject.
2. Reason is required.
3. Request becomes Rejected.
4. Requester is notified.

---

# 29. Procurement Fulfilment Flow

## Actor

Owner or purchasing user.

## Main Flow

1. Approved request is purchased.
2. User selects **Mark Purchased**.
3. Request becomes Purchased.
4. Goods arrive at the resort.
5. User selects **Mark Delivered**.
6. Request becomes Delivered.
7. User selects **Close Request** after handover or verification.
8. Request becomes Closed.

The MVP does not maintain stock quantities or inventory valuation.

---

# 30. Direct Chat Flow

## Actor

Any authenticated staff user with chat access.

## Main Flow

1. User opens Chat.
2. User selects a recent conversation or starts a new one.
3. User writes a text message or attaches a photo.
4. User taps Send.
5. Message appears optimistically with Sending state.
6. Backend stores the message.
7. Message becomes Sent.
8. Recipient receives a push notification according to settings.

## Failed Message

1. Message remains visible with Failed status.
2. User may tap Retry.
3. Duplicate messages must not be created.

---

# 31. Contextual Operational Chat Flow

## Purpose

Allow users to start a conversation from an operational entity.

## Entry Points

- Room Detail;
- Maintenance Detail;
- Procurement Detail.

## Main Flow

1. User selects **Open Chat** or **Discuss**.
2. Application opens a relevant existing conversation or starts a new one.
3. A compact entity reference is attached.
4. Recipients can open the referenced room, issue, or request.

Entity-specific channels may be deferred beyond MVP, but entity links should be architecturally supported.

---

# 32. Push Notification Flow

## Trigger Examples

- new direct message;
- Critical maintenance issue;
- maintenance assignment;
- check-out creates urgent cleaning;
- arrival is imminent and room is not Ready;
- urgent procurement request.

## Main Flow

1. Backend creates notification for relevant users.
2. Push service delivers notification.
3. User taps notification.
4. PWA opens or comes to foreground.
5. Authentication is validated.
6. User is deep-linked to the relevant entity.
7. Notification becomes Read.

## Grouping

Non-critical repeated notifications may be grouped.

Critical maintenance must remain individually visible.

---

# 33. Notification Permission Flow

## Main Flow

1. User reaches a point where notifications provide clear value.
2. Application explains why notifications are needed.
3. User chooses Enable or Not Now.
4. Browser or OS permission prompt appears only after user intent.
5. Result is stored.
6. Settings show the current notification state.

Do not request push permission immediately on first page load without context.

---

# 34. Search Flow

## Actor

Any authorized user.

## Main Flow

1. User opens Global Search.
2. User enters a query.
3. Search runs incrementally after a short debounce.
4. Results are grouped by entity type.
5. User selects a result.
6. Application opens the corresponding detail screen.
7. Back navigation returns to search results and preserves the query.

---

# 35. Language Selection Flow

## Main Flow

1. On first use, application reads the device language.
2. If Thai, application selects Thai.
3. If English, application selects English.
4. Any unsupported language falls back to English.
5. User may override the language in Settings.
6. Interface updates immediately or after a controlled reload.
7. User preference persists across sessions.

Operational data entered by staff is not automatically translated unless a specific AI translation action is provided.

---

# 36. Connectivity Loss Flow

## Main Flow

1. Application detects network loss.
2. Persistent banner appears.
3. Existing loaded data remains visible as potentially stale.
4. Write operations are disabled.
5. User may continue navigating previously loaded screens where safe.
6. Application periodically checks connectivity.
7. When connection returns:
   - banner changes to Connection Restored;
   - affected data refreshes;
   - write actions are re-enabled.

## Important Rule

The MVP does not support offline writes or deferred synchronization.

---

# 37. Stale Data Conflict Flow

## Example

User opens a Dirty room while another user marks it Cleaning.

## Main Flow

1. User attempts an outdated action.
2. Backend compares current version or state.
3. Action is rejected as stale.
4. UI refreshes the entity.
5. User sees a concise explanation.

> This room was updated by another user. The latest status is now displayed.

The system must never silently overwrite newer operational state.

---

# 38. Cancellation and No-Show Flow

## Reservation Cancelled Before Check-In

1. Beds24 reports cancellation.
2. Reservation state updates.
3. Operational check-in action disappears.
4. Room occupancy is recalculated.
5. Any arrival warning is removed.
6. Existing housekeeping state remains unchanged.

## No Show

1. Authorized user selects or receives No Show state.
2. Room does not become Occupied.
3. Reservation remains visible as No Show.
4. Availability recalculates according to Beds24 and business rules.
5. No check-out housekeeping task is created because no physical stay occurred.

## Cancellation After Operational Check-In

A Beds24 cancellation must not automatically remove a physically present guest.

1. Operational Checked In state remains active.
2. Owner receives a conflict warning.
3. Manual resolution is required.

---

# 39. Same-Day Room Turnover Flow

## Scenario

Guest A departs and Guest B arrives in the same room on the same date.

## Main Flow

1. Beds24 identifies departure and arrival for the same room.
2. Before Guest A leaves, room remains Occupied.
3. Staff completes Guest A check-out.
4. Room becomes Vacant + Dirty.
5. Housekeeping task is created with High or Critical priority.
6. Next arrival time appears on the task.
7. Housekeeping starts cleaning.
8. Staff completes Room Ready checklist.
9. Room becomes Ready.
10. Arrival warning clears.
11. Reception completes Guest B check-in.
12. Room becomes Occupied under Guest B.

## Incorrect Sequence Protection

If staff attempts Guest B check-in before Guest A check-out:

- action is blocked because another active stay occupies the room.

If staff attempts Guest B check-in while room is Dirty:

- warning or blocking behavior follows configured policy.

---

# 40. Room State Resolution Logic

The current display state of a room must be derived in this order.

## Occupancy

1. Active operational Checked In stay → Occupied.
2. Latest operational Checked Out state with no new stay → Vacant.
3. Beds24 expected arrival without check-in → Expected Arrival.
4. No active reservation → Vacant.

## Housekeeping

Stored independently as:

- Dirty;
- Cleaning;
- Ready;
- Inspection Required.

## Maintenance

Highest active severity determines room maintenance badge:

1. Out of Service;
2. Critical;
3. Open Issue;
4. Normal.

## Combined Example

A room may validly be:

- Vacant + Dirty + Maintenance Normal;
- Occupied + Ready + Open Issue;
- Vacant + Cleaning + Critical;
- Vacant + Ready + Out of Service.

The interface must not collapse these dimensions into one ambiguous status.

---

# 41. QA Acceptance Flow Matrix

Each implementation must verify at minimum:

| Flow | Expected Result |
|---|---|
| Complete check-in | Room becomes Occupied and arrival state becomes Checked In |
| Complete check-out | Room becomes Vacant + Dirty and housekeeping task is created |
| Same-day turnover | Cleaning priority increases and next arrival is shown |
| Start cleaning | Task becomes Cleaning and current user is assigned |
| Mark Ready | Checklist is stored and room becomes Ready |
| Report Critical issue | Maintenance state updates and responsible users are notified |
| Mark Out of Service | Room is excluded from usable operational availability |
| Resolve maintenance | Issue becomes Resolved without incorrectly marking room Ready |
| Create procurement request | Request appears for Owners in Requested state |
| Send message | Recipient receives message and eligible push notification |
| Lose network | Writes are disabled and stale data warning appears |
| Concurrent update | Newer state is preserved and stale action is rejected |

---

# 42. End of Document

This document defines the primary user flows required for the Vanara Operations MVP.

Detailed API contracts, database implementation, notification infrastructure, and role permission matrices must align with these flows without changing their operational meaning.



<!-- ====================================================== -->

# SOURCE: 05_COMPONENT_GUIDELINES(1).md


# 05_COMPONENT_GUIDELINES.md

# Vanara Operations UI Component Guidelines

## Purpose
Define a consistent UI system for all operational screens.

## Design Principles
- Mobile-first
- Outdoor readability
- One-handed operation
- Large touch targets (min 44x44 px)
- Maximum two taps for common actions
- Consistent spacing and typography

## Color Semantics
- Green: Success / Ready / Available
- Blue: Information / Arrival
- Orange: Warning / Departure / Cleaning
- Red: Critical / Out of Service / Error
- Gray: Neutral / Disabled

Never rely on color alone; always pair with text and icon.

## Typography
- Page Title
- Section Title
- Card Title
- Body
- Caption

Use a maximum of two font families.

## Room Card
Contains:
- Photo
- Room name
- Occupancy badge
- Housekeeping badge
- Maintenance badge
- Guest name (if occupied)

Entire card is tappable.

## Badges
Every badge includes:
- Color
- Icon
- Text

Examples:
- Occupied
- Vacant
- Dirty
- Cleaning
- Ready
- Critical
- Out of Service

## Buttons
Primary: Main action
Secondary: Alternative action
Danger: Destructive actions

## Search
Incremental search with instant filtering.

## Filter Chips
Multi-select.
Clearly show active state.

## Bottom Navigation
Five tabs:
- Dashboard
- Rooms
- Availability
- Chat
- More

## Toasts
Used for successful lightweight actions.
Disappear automatically.

## Dialogs
Only for destructive or irreversible actions.

## Bottom Sheets
Preferred for:
- Quick actions
- Filters
- Status changes

## Forms
Minimize typing.
Prefer:
1. Buttons
2. Toggles
3. Dropdowns
4. Text input

## Skeleton Loading
Use skeleton placeholders instead of blocking spinners.

## Empty States
Always explain why no data is shown and suggest the next action.

## Error States
Keep navigation available.
Provide Retry where appropriate.

## Responsive Rules
Optimized for smartphones.
Tablet support by adaptive spacing only.

## Accessibility
- High contrast
- Large touch targets
- Supports system font scaling
- Icons always accompanied by labels

## UI Consistency Rules
- Same component = same behavior everywhere.
- No hidden gestures for critical operations.
- One primary action per screen.



<!-- ====================================================== -->

# SOURCE: 06_ARCHITECTURE_DECISIONS(1).md


# 06_ARCHITECTURE_DECISIONS.md

# Vanara Operations
## Architecture Decision Records (ADR)

Version: 1.0

---

# ADR-001 — Single Resort Architecture

Decision

The application is built for one resort only.

Rationale

Vanara Operations is an internal operational tool. Multi-tenant complexity provides no business value.

Consequence

No tenant management, organization selector or multi-property abstraction.

---

# ADR-002 — Beds24 Is the Source of Truth

Decision

Beds24 remains the reservation source of truth.

Vanara Operations never replaces the PMS.

Responsibilities delegated to Beds24:

- Reservations
- Rates
- Availability
- OTA synchronization
- Guest booking data

Vanara Operations adds only operational information.

---

# ADR-003 — Operational State Overrides Scheduled State

Decision

Operational state has priority over reservation dates.

Examples:

- Check-In Complete
- Check-Out Complete
- Dirty
- Ready
- Occupied

Reason

Physical reality inside the resort is more important than scheduled dates.

---

# ADR-004 — Room Detail Is The Central Entity

Decision

Every operational workflow starts from Room Detail.

Reason

Rooms are the center of resort operations.

Modules should link to Room Detail instead of creating duplicate interfaces.

---

# ADR-005 — Mobile First

Decision

Every screen is designed for smartphones first.

Reason

Staff work while moving around the resort.

Desktop is not an MVP requirement.

---

# ADR-006 — PWA

Decision

The application is delivered as a Progressive Web App.

Benefits

- Installable
- No App Store dependency
- Fast deployment
- Cross-platform

---

# ADR-007 — English / Thai Only

Decision

Operational UI supports:

- English
- Thai

Language defaults to the device language.

---

# ADR-008 — Operational Simplicity

Decision

Every common task should require no more than two taps.

Avoid:

- Hidden gestures
- Deep navigation
- Complex menus

---

# ADR-009 — Room Status Model

Operational room state combines multiple dimensions:

Occupancy

- Vacant
- Occupied

Housekeeping

- Dirty
- Cleaning
- Ready

Maintenance

- Normal
- Warning
- Critical
- Out of Service

These dimensions remain independent.

---

# ADR-010 — Automatic Housekeeping Trigger

Decision

Operational Check-Out immediately:

- sets room Vacant
- sets room Dirty
- creates housekeeping work
- recalculates priority

No manual housekeeping activation.

---

# ADR-011 — Same-Day Turnover Priority

Decision

Rooms with departure and arrival on the same day automatically receive elevated cleaning priority.

Reason

Minimize guest waiting time.

---

# ADR-012 — Internal Chat

Decision

Replace operational LINE communication with an integrated chat.

Customer messaging is excluded.

---

# ADR-013 — AI Is Selective

Decision

AI is used only where it adds value.

Use AI for:

- Staff questions
- Operational guidance
- Natural language

Do NOT use AI for:

- Status calculations
- Availability logic
- Reservation state
- Workflow execution

These remain deterministic.

---

# ADR-014 — No Offline Mode

Decision

Offline synchronization is excluded from MVP.

Reason

Operational complexity outweighs the benefit.

Users should rely on Wi-Fi or mobile data.

---

# ADR-015 — Minimal History

Decision

Keep current operational state and essential audit records only.

Avoid building a complete historical ERP.

---

# ADR-016 — Maintenance Escalation

Decision

Maintenance follows:

1. Internal technician
2. External specialist if unresolved

The application supports escalation but does not automate external dispatch.

---

# ADR-017 — Procurement Scope

Decision

Procurement manages requests only.

Inventory management is outside MVP scope.

---

# ADR-018 — Consistent Navigation

Decision

Primary navigation is fixed across the application.

No hamburger menu.

Bottom navigation is the primary navigation pattern.

---

# ADR-019 — Role-Based Visibility

Decision

Users only see actions they are authorized to perform.

Avoid displaying disabled actions unless operationally useful.

---

# ADR-020 — Performance First

Decision

Operational speed has higher priority than visual richness.

Target:

- Startup <2 s
- Navigation <300 ms perceived
- Immediate UI feedback for every action

---

# ADR-021 — Future Extensibility

The architecture must allow future modules without redesign:

- Owner Dashboard
- Passport Management
- Guest CRM
- Assets
- Financial KPIs
- AI Workflows
- Vanara Central integration

Current MVP should not include them but should not block them.

# End



<!-- ====================================================== -->

# SOURCE: 07_MVP_SCOPE(1).md


# 07_MVP_SCOPE.md

# Vanara Operations MVP Scope

Version: 1.0

Purpose:
Define exactly what is included in the MVP and, equally important, what is intentionally excluded.

---

# 1. MVP Goal

Deliver a production-ready operational application that replaces the resort's daily operational workflow currently managed through LINE and scattered manual processes.

The MVP is successful when the staff can operate the resort efficiently without relying on multiple disconnected tools.

---

# 2. IN SCOPE

## Authentication

- Login
- Logout
- Session persistence
- Basic role support

---

## Dashboard

- Operational summary
- Quick access modules
- Notifications

---

## Room Workspace

- Room cards
- Operational status
- Search
- Filters
- Room Detail

---

## Room Detail

- Guest information
- Reservation summary
- Housekeeping
- Maintenance
- Procurement shortcuts
- Operational actions

---

## Arrivals & Departures

- Daily arrivals
- Daily departures
- Calendar selection
- Operational Check-In Complete
- Operational Check-Out Complete

---

## Housekeeping

- Dirty
- Cleaning
- Ready
- Priority rooms
- Room Ready Checklist

---

## Availability

- Operational availability
- Walk-in support
- Date selection
- Search
- Filters

---

## Maintenance

- Report issue
- Assign
- Status workflow
- Internal escalation
- Out of Service

---

## Procurement

- Supply requests
- Approval workflow
- Delivery workflow

---

## Internal Chat

- Direct conversations
- Group conversations
- Images
- Push notifications

---

## Notifications

- Chat
- Arrivals
- Departures
- Housekeeping
- Maintenance
- Procurement

---

## Ask Waraporn

Operational AI assistant.

---

# 3. OUT OF SCOPE

The following are intentionally excluded from the MVP.

## Inventory Management

No warehouse.

No stock quantities.

No automatic consumption.

---

## Financial Management

No accounting.

No invoices.

No payroll.

No expenses.

---

## CRM

No marketing.

No guest loyalty.

No campaigns.

---

## Passport Archive

Only operational linkage if required.

No full document management.

---

## Asset Management

No maintenance history for every asset.

Future module.

---

## Offline Synchronization

Excluded.

---

## Advanced Analytics

No BI.

No charts.

No KPIs.

---

## Multi Resort

Single resort only.

---

## Multi Company

Excluded.

---

## OTA Management

Beds24 remains responsible.

---

## Reservation Editing

Reservation editing remains inside Beds24.

---

## Price Management

Handled by Beds24.

---

## Payment Management

Handled by Beds24 / Stripe.

---

## Inventory Purchasing

Only requests.

No purchasing ERP.

---

## AI Automation

No autonomous AI workflows.

AI answers questions only.

---

# 4. FUTURE MODULES

Possible future roadmap.

- Owner Dashboard
- Staff Management
- Asset Registry
- Preventive Maintenance
- Passport Management
- Financial Dashboard
- Business Intelligence
- AI Workflow Engine
- Vendor Management
- Document Repository
- Vehicle Management
- Garden Management
- Restaurant Operations
- Laundry Tracking

These modules must not influence the MVP architecture.

---

# 5. MVP Acceptance Criteria

The MVP is considered complete when:

✓ Staff can manage daily operations without LINE.

✓ Operational room status is always reliable.

✓ Operational Check-In and Check-Out override scheduled reservation assumptions.

✓ Dirty rooms automatically generate housekeeping work.

✓ Same-day turnovers are prioritized.

✓ Maintenance workflow is fully usable.

✓ Procurement requests are operational.

✓ Internal chat replaces operational messaging.

✓ Ask Waraporn can answer operational questions using current resort data.

✓ The application performs reliably on modern smartphones.

---

# 6. Definition of Done

The MVP is released when:

- Functional testing completed.
- UI consistency verified.
- No critical defects.
- All core workflows validated by resort staff.
- Production deployment approved.

---

# End of 07_MVP_SCOPE.md
