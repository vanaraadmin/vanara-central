\# ROOM\_WORKSPACE\_EXECUTION\_PLAN.md



Status: Execution Plan v1

Repository: Vanara Central

Owner: Software Architecture



\---



\# Purpose



This document translates the Room Workspace Architecture into executable implementation sprints.



It intentionally avoids describing philosophy.



Every sprint must be independently implementable.



Every sprint finishes with:



Validation



↓



Deploy



↓



Smoke



↓



Commit



↓



WORKING TREE CLEAN



No sprint may leave unfinished repository state.



\---



\# Sprint 1



\## Room Home



Objective



Create the definitive Room Home.



The Staff Home receives a new first module:



Rooms



The module becomes the first operational widget of Vanara Central.



The user immediately understands the entire resort.



\### Deliverables



Compact Room List



Expandable rows



Single expanded room



Outside click collapse



ESC collapse



Hero placeholder



Read model integration



No redesign of business logic.



\---



Acceptance



One expanded room only.



No navigation.



Smooth disclosure.



Working Tree Clean.



\---



\# Sprint 2



\## Operational Summary



Objective



Complete the upper operational area.



Cards:



Operational Availability



Occupancy



Housekeeping



Maintenance



Reception Alerts



No editing.



Pure operational visibility.



\---



Acceptance



Every operational dimension comes from its own authoritative source.



No duplicated business logic.



\---



\# Sprint 3



\## Guest



Objective



Implement Guest card.



Visible only when occupied.



Display:



Guest



Nationality



OTA



Arrival



Departure



Stay



No passport.



No payment.



No duplicate Reception data.



\---



Acceptance



Guest disappears naturally when room becomes vacant.



\---



\# Sprint 4



\## Reception Card



Objective



Reception operational integration.



Display:



Passport



Deposit



Check-in



Check-out



Operational alerts



Contextual actions.



No duplicate Room logic.



\---



Acceptance



Reception owns Reception.



Room Workspace only consumes.



\---



\# Sprint 5



\## Housekeeping Card



Objective



Housekeeping inside Room Workspace.



Display:



Ready



Cleaning



Water



On Demand



Actions:



Start



Finish



Create On Demand



Only when relevant.



\---



Acceptance



Housekeeping workflow can be completed entirely from Room Workspace.



No duplicate Housekeeping implementation.



\---



\# Sprint 6



\## Maintenance Card



Objective



Maintenance integration.



Display



Current ticket



Blocking



Assigned



Status



Actions



Report Issue



View Ticket



No duplicate Maintenance UI.



\---



Acceptance



Blocking immediately reflected.



Room never leaves current context.



\---



\# Sprint 7



\## Operational Notes



Objective



Room Notes.



Very lightweight.



No editor.



No formatting.



Operational only.



\---



Acceptance



Fast.



Simple.



Always visible.



\---



\# Sprint 8



\## Timeline



Objective



Operational history.



Examples:



Check In



Cleaning



Maintenance



Passport



Check Out



Newest first.



Compact.



No database history.



No technical logs.



\---



Acceptance



Useful.



Readable.



No noise.



\---



\# Sprint 9



\## UI Polish



Objective



Review every card.



Spacing



Typography



Alignment



Icons



Hero



Density



No feature work.



Only presentation.



\---



Acceptance



Premium.



Consistent.



Readable.



\---



\# Sprint 10



\## Motion \& Interaction



Objective



Final interaction pass.



Expand



Collapse



Loading



Optimistic update



Card transitions



Dismiss



Scroll preservation



No decorative animation.



Only operational motion.



\---



Acceptance



Motion communicates state.



Nothing decorative.



\---



\# Sprint 11



\## QA



Objective



Real operational validation.



Reception



Housekeeping



Maintenance



Passport



Real bookings



Real check-out



Real cleaning



Real maintenance



No synthetic scenarios.



\---



Acceptance



Real resort behaves correctly.



\---



\# Sprint 12



\## Freeze



Objective



Freeze Room Workspace.



Generate:



ROOM\_WORKSPACE.md



Archive architecture.



Archive product rules.



Archive interaction rules.



Room Workspace becomes the canonical implementation for future Vanara modules.



\---



\# Engineering Rules



Every sprint must:



\- reuse existing services;

\- reuse existing permissions;

\- reuse existing upload pipeline;

\- reuse existing audit;

\- reuse existing Room Read Model.



Never duplicate architecture.



\---



\# Product Rules



Room Workspace is always:



Room-centric



Progressively disclosed



Contextual



Calm



Operational



Premium



No sprint may violate these principles.



\---



\# Completion Criteria



Room Workspace is complete when:



Reception no longer requires opening another page.



Housekeeping can be completed from Room Workspace.



Maintenance can be managed from Room Workspace.



Every room becomes the operational identity of the resort.



Future modules integrate into the room instead of creating new navigation.
