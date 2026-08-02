\# ROOM\_WORKSPACE\_PRODUCT.md



Status: Product Definition v1

Module: Room Workspace

Repository: Vanara Central

Owner: Product Design



\---



\# 1. Purpose



Room Workspace is the most frequently used operational screen inside Vanara Central.



Every day the staff should be able to understand the complete operational state of a room within a few seconds.



Room Workspace is not designed for administration.



It is designed for operation.



\---



\# 2. User Goal



When opening a room, the user should immediately answer these questions:



\- Is the room occupied?

\- Is the room available?

\- Is it clean?

\- Is there a maintenance issue?

\- Is there something I have to do?



Nothing else has higher priority.



\---



\# 3. Information Hierarchy



Information is revealed progressively.



Never show everything immediately.



The user first sees:



Room



↓



Then



Operational Situation



↓



Then



Guest



↓



Then



Actions



↓



Then



History



This hierarchy is fixed.



\---



\# 4. Compact Room



The compact room is the entry point.



It is intentionally extremely compact.



Every room occupies only one visual row.



The purpose is scanning.



Not interaction.



The compact card answers:



"What is happening here?"



Only.



\---



\# 5. Expanded Room



Expanding a room transforms it into a complete operational workspace.



It never navigates.



It unfolds.



The room remains anchored.



The user never loses context.



\---



\# 6. Hero



Every room starts with a hero image.



Purpose:



Recognition.



Not decoration.



The hero should be approximately 180–220 px high.



Large enough to recognise the room.



Small enough to keep operational information visible without excessive scrolling.



\---



\# 7. Occupancy



The first operational information is Occupancy.



Possible values:



Occupied



Vacant



Not Operating



This is more important than every other section.



\---



\# 8. Guest Information



Visible only if Occupied.



Display:



Guest Name



Nationality



OTA



Arrival



Departure



Stay Duration



Nothing more.



No passport.



No payment.



No notes.



Those belong to Reception.



\---



\# 9. Operational Status



Below Guest.



Display independent operational dimensions.



Operating / Not Operating



Ready / Not Ready



Maintenance



These are indicators.



Not actions.



\---



\# 10. Reception Section



Only operational Reception information.



Examples:



Passport



Deposit



Check-in completed



Check-out expected



Nothing administrative.



\---



\# 11. Housekeeping Section



Housekeeping appears only as operational work.



Examples:



Cleaning



Water



On Demand



No historical tables.



No checklist history.



Only current operational state.



\---



\# 12. Maintenance Section



If ticket exists:



show ticket summary.



If no ticket exists:



show only:



Report Issue



Maintenance never occupies unnecessary space.



\---



\# 13. Actions



Actions always belong to their own section.



Never mix Reception actions with Housekeeping actions.



Never mix Maintenance actions with Passport.



The user should immediately understand which module owns each action.



\---



\# 14. Visual Density



Room Workspace must feel information-rich.



Not crowded.



Every section should fit comfortably on mobile.



Large empty spaces are discouraged.



The user should rarely need long scrolling.



\---



\# 15. Progressive Disclosure



Nothing appears until it becomes relevant.



Examples:



No Guest



↓



Guest section hidden.



No Maintenance



↓



Maintenance summary hidden.



No Cleaning



↓



Housekeeping actions reduced.



This keeps the interface calm.



\---



\# 16. Empty States



Every section owns its own empty state.



Examples:



No Guest



No Maintenance



No Housekeeping work



Never create generic empty screens.



\---



\# 17. Role Behaviour



The workspace layout never changes.



Capabilities change.



Owner



↓



More actions.



Housekeeping



↓



Housekeeping actions.



Reception



↓



Reception actions.



Maintenance



↓



Maintenance actions.



The visual structure always remains identical.



\---



\# 18. Operational Philosophy



Room Workspace is not where data is entered.



Room Workspace is where decisions are made.



Every section should answer:



"Do I need to do something?"



If the answer is "No"



The section should become visually quiet.



\---



\# 19. Product Rule



Room Workspace must never become another Reception page.



Room Workspace must never become another Housekeeping page.



Room Workspace must never become another Maintenance page.



It only aggregates those operational modules into one coherent experience.



\---



\# 20. Acceptance Criteria



Room Workspace is successful when:



\- Staff recognises the room immediately.

\- Operational status is understood within seconds.

\- The user never wonders where to perform an action.

\- Every action clearly belongs to one operational module.

\- The interface feels calm even when many operational states exist.

\- Navigation outside Room Workspace becomes the exception rather than the rule.
