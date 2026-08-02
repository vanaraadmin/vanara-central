\# ROOM\_WORKSPACE\_COMPONENTS.md



Status: Component Architecture v1

Module: Room Workspace

Repository: Vanara Central

Owner: UI Architecture



\---



\# 1. Purpose



This document defines the component hierarchy of Room Workspace.



It is intentionally implementation-oriented.



Every future implementation should reuse these components.



Room Workspace must never become one giant React page.



\---



\# 2. Root Component



```

RoomWorkspace

```



Responsibilities:



\- orchestration

\- state

\- permissions

\- expansion

\- data loading



Nothing else.



\---



\# 3. Component Tree



```

RoomWorkspace



│



├── RoomCompactRow



├── RoomHero



├── RoomOperationalCard



├── GuestCard



├── ReceptionCard



├── HousekeepingCard



├── MaintenanceCard



├── NotesCard



├── HistoryCard



└── RoomActions

```



Every component owns one responsibility.



No duplicated logic.



\---



\# 4. RoomCompactRow



Purpose



Collapsed room.



Responsibilities



\- room identity

\- occupancy

\- housekeeping state

\- maintenance badge

\- operating status



Never:



Guest details



Buttons



Forms



History



\---



\# 5. RoomHero



Purpose



Recognition.



Contains



\- official room photo

\- room name

\- room type



Nothing else.



Hero never contains actions.



\---



\# 6. RoomOperationalCard



Purpose



Current operational situation.



Displays



Operating



Occupancy



Ready



Maintenance



No editing.



Pure status.



\---



\# 7. GuestCard



Visible only when occupied.



Displays



Guest



Nationality



OTA



Arrival



Departure



Stay



Never:



Passport



Deposit



History



Those belong elsewhere.



\---



\# 8. ReceptionCard



Reception operational state.



Displays



Passport



Deposit



Check-in



Check-out



Alerts



Contains Reception actions only.



Never Maintenance.



Never Housekeeping.



\---



\# 9. HousekeepingCard



Purpose



Current operational work.



Question answered:



"What does Housekeeping need to do now?"



Possible states



Ready



Cleaning Required



Cleaning In Progress



Waiting For Reception



Cleaning Blocked



Displays



Current task



Assigned operator



Current action



Never historical tasks.



Never completed history.



Never display physical room condition as the Housekeeping card state.



The stored room condition remains in Room Status.



The Housekeeping card presents operational work only.



\---



\# 10. MaintenanceCard



Purpose



Technical state.



If ticket exists



↓



summary



If no ticket



↓



Report Issue



Blocking tickets appear immediately.



No duplicate information.



\---



\# 11. NotesCard



Purpose



Operational notes.



Very lightweight.



No formatting.



No attachments.



No history.



\---



\# 12. HistoryCard



Purpose



Timeline.



Newest first.



Operational events only.



Examples



Check In



Cleaning



Maintenance



Passport



Check Out



Never technical logs.



\---



\# 13. RoomActions



Purpose



Contextual actions.



Actions depend on capability.



Examples



Reception



↓



Collect Passport



Housekeeping



↓



Start Cleaning



Maintenance



↓



Report Issue



Owner



↓



Override Ready



Actions never appear outside their owning module.



\---



\# 14. Component Ownership



RoomCompactRow



owns



collapsed presentation



RoomHero



owns



identity



OperationalCard



owns



status



GuestCard



owns



guest



ReceptionCard



owns



Reception



HousekeepingCard



owns



Housekeeping



MaintenanceCard



owns



Maintenance



HistoryCard



owns



timeline



This ownership must remain permanent.



\---



\# 15. Shared Design Rules



Every card shares



radius



padding



spacing



typography



animation



dismiss behaviour



No component invents its own style.



\---



\# 16. Expand Behaviour



Only one RoomWorkspace may remain expanded.



Opening another room



↓



collapses previous



↓



expands new room



Outside tap



↓



collapse



ESC



↓



collapse



No Close button.



\---



\# 17. State Management



RoomWorkspace owns



Expanded Room



Loading



Refresh



Permission



Cards receive only props.



Cards never own business logic.



\---



\# 18. Future Components



Future modules integrate by adding one new card.



Examples



ProcurementCard



EnergyCard



MiniBarCard



IoTCard



The overall layout never changes.



Only new cards appear.



\---



\# 19. Design System Rule



Every Room component must be reusable.



No component may be implemented exclusively for one page if it can become part of the Vanara Design System.



Examples:



RoomHero



OperationalCard



MaintenanceCard



GuestCard



must all become reusable UI components.



\---



\# 20. Permanent Rule



Room Workspace is built from independent cards.



Each card owns one domain.



Each domain owns one business logic.



Room Workspace only composes them together.



No future implementation may merge multiple domains into one large component.
