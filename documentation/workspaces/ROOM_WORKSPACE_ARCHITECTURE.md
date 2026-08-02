\# Vanara Central

\# Room Workspace Architecture



Status: Draft Architecture v1

Module: Room Workspace

Owner: Product Architecture

Repository: Vanara Central



\---



\# 1. Purpose



Room Workspace is the operational heart of Vanara Central.



It is not Reception.



It is not Housekeeping.



It is not Maintenance.



It is the digital identity of one physical accommodation.



Every operational module revolves around a Room.



The Room Workspace aggregates those modules into one operational view.



\---



\# 2. Product Philosophy



Vanara Central is room-centric.



The room is the primary domain object.



Every operational action is attached to a room.



Examples:



\- Reception works on a room.

\- Housekeeping works on a room.

\- Maintenance works on a room.

\- Passport belongs to the current stay of a room.



Therefore Room Workspace becomes the primary operational screen of the application.



\---



\# 3. Design Principles



The workspace must be:



\- mobile first;

\- expandable;

\- visually calm;

\- information dense;

\- low tap;

\- contextual;

\- role aware;

\- operational.



It must never become a traditional PMS screen.



No enterprise tables.



No accordion forests.



No administration feeling.



\---



\# 4. Navigation



Rooms Home



↓



Compact Room Card



↓



Tap



↓



Expand inline



↓



Complete Room Workspace



No navigation to another page.



The room expands inside the current list.



Only one room may remain expanded at any time.



Opening another room automatically collapses the previous one.



Tap outside collapses.



ESC collapses.



No Close button.



This behaviour follows the global Vanara Dismissable Layer rule.



\---



\# 5. Compact Card



The compact card is intentionally minimal.



It answers only one question:



"What is the situation of this room?"



Visible information:



\- Room Name

\- Occupancy

\- Operational Availability

\- Housekeeping Status

\- Maintenance Badge

\- Current Guest (only if occupied)



Nothing more.



No actions.



No buttons.



No forms.



\---



\# 6. Expanded Workspace



Expanding a room reveals the complete operational workspace.



The expansion does not navigate.



The list simply grows downward.



The first visible section is a compact hero image of the room.



The hero is decorative but operationally useful.



It helps staff immediately recognise the room.



\---



\# 7. Operational Dimensions



Room Workspace never stores one combined room status.



The room is composed of independent dimensions.



Operational Availability



\- Operating

\- Not Operating



Occupancy



\- Vacant

\- Occupied



Housekeeping



\- Ready

\- Not Ready



Maintenance



\- Clear

\- Active

\- Blocking



These dimensions never overwrite each other.



\---



\# 8. Information Ownership



Room Workspace never owns data.



Every section consumes another module.



Reception owns:



\- Guest

\- Booking

\- Passport

\- Deposit

\- Check-in

\- Check-out



Housekeeping owns:



\- Cleaning Tasks

\- Water

\- Linen

\- On-Demand Cleaning



Maintenance owns:



\- Tickets

\- Blocking

\- Photos



Room Workspace orchestrates.



It never duplicates business logic.



\---



\# 9. Contextual Actions



Actions are contextual.



Reception actions appear only when Reception data exists.



Housekeeping actions appear only when Housekeeping work exists.



Maintenance actions appear only when appropriate.



Room Workspace never becomes a generic action panel.



\---



\# 10. Role Awareness



Owner



Complete visibility.



Manager



Operational visibility.



Reception



Reception actions.



Housekeeping



Housekeeping actions.



Maintenance



Maintenance actions.



The layout remains identical.



Only capabilities change.



Vanara never creates different Room Workspaces per role.



\---



\# 11. Images



Every accommodation owns one official image.



The image is reused everywhere.



Reception.



Housekeeping.



Maintenance.



Room Workspace.



No duplicated photo systems.



The Room Workspace hero becomes the canonical room image.



\---



\# 12. Future Compatibility



Future modules must integrate into Room Workspace.



Examples:



\- Procurement

\- Smart Devices

\- Energy

\- Mini Bar

\- AI



Room Workspace remains the single operational aggregation layer.



No future module should bypass it.



\---



\# 13. Architectural Rule



The Room Workspace is not another module.



It is the convergence point of every operational module.



Any future feature affecting a room should first be evaluated for integration inside Room Workspace before creating a separate user experience.
