\# ROOM\_WORKSPACE\_IMPLEMENTATION.md



Status: Executable Implementation Specification v1

Module: Room Workspace

Repository: Vanara Central

Owner: Software Architecture



\---



\# 1. Purpose



This document defines how Room Workspace must be implemented.



It intentionally bridges Product Design and Engineering.



Codex should not reinterpret this document.



It should implement it.



\---



\# 2. Root Principle



Room Workspace is an orchestration layer.



It owns presentation.



It does NOT own business logic.



Every operational section consumes another module.



Room Workspace never duplicates backend logic.



\---



\# 3. Component Tree



The implementation shall follow this hierarchy.



```

RoomWorkspace



│



├── RoomCompactRow



├── RoomExpandedWorkspace



│     ├── RoomHero

│     ├── OperationalStatusCard

│     ├── GuestCard

│     ├── ReceptionCard

│     ├── HousekeepingCard

│     ├── MaintenanceCard

│     ├── NotesCard

│     └── HistoryCard



```



No card should directly access unrelated modules.



\---



\# 4. Data Flow



Every card receives data.



No card loads data independently.



```

Room Workspace



↓



Room Read Model



↓



Cards



↓



Presentation

```



The Room Read Model becomes the only frontend contract.



Cards never aggregate APIs themselves.



\---



\# 5. Room Read Model



The read model should expose only presentation data.



Examples:



Room



Operational Availability



Occupancy



Guest Summary



Reception Summary



Housekeeping Summary



Maintenance Summary



Current Alerts



Current Actions



Cards must never assemble these pieces independently.



\---



\# 6. Expand Behaviour



Only one expanded room.



Implementation:



```

expandedRoomId



↓



null



or



Room ID

```



Changing the value collapses the previous room automatically.



\---



\# 7. State Ownership



The Room Workspace owns only:



Expanded Room



Loading



Refresh



Everything else remains inside backend services.



\---



\# 8. Refresh Strategy



Room Workspace refreshes only when:



Reception changes



Housekeeping changes



Maintenance changes



Passport changes



Manual refresh



No periodic polling should be implemented specifically for Room Workspace.



\---



\# 9. Contextual Actions



Every card owns its own actions.



ReceptionCard



↓



Reception actions



HousekeepingCard



↓



Housekeeping actions



MaintenanceCard



↓



Maintenance actions



Never place global action buttons at page level.



\---



\# 10. Images



RoomHero receives:



```

room.image

```



No card resolves image paths.



Image mapping remains centralized.



\---



\# 11. Empty Cards



If a section has no operational value:



Hide it.



Do not render empty containers.



Example:



No Guest



↓



GuestCard omitted.



No Maintenance



↓



MaintenanceCard reduced to:



Report Issue



\---



\# 12. Permissions



Permissions determine:



Visible actions.



Never visible layout.



Every role sees the same Room.



Only available actions change.



\---



\# 13. CSS



Cards never define spacing independently.



Spacing belongs to:



Room Workspace Layout



Cards only define internal spacing.



\---



\# 14. Responsive Behaviour



Desktop



Tablet



Phone



share exactly the same information hierarchy.



Only width changes.



Never create a second Room Workspace layout.



\---



\# 15. Error Isolation



Each card handles its own error.



Maintenance failure



↓



MaintenanceCard error.



Guest remains visible.



Reception failure



↓



ReceptionCard error.



Everything else continues working.



Never fail the entire Room Workspace.



\---



\# 16. Skeletons



Only the loading card displays skeletons.



Already loaded cards remain visible.



No global loading overlays.



\---



\# 17. Performance



Room Workspace should avoid unnecessary rerenders.



Only cards whose data changed should update.



Guest changes



↓



GuestCard rerenders.



Maintenance remains untouched.



\---



\# 18. Animations



Animations belong to:



Room expansion



Card appearance



Status changes



Nothing else.



Cards never invent independent animations.



\---



\# 19. Future Extensions



Future cards may include:



ProcurementCard



EnergyCard



IoTCard



SmartDevicesCard



MiniBarCard



without changing RoomWorkspace architecture.



\---



\# 20. Permanent Engineering Rule



Room Workspace is a composition engine.



Business logic belongs to modules.



Presentation belongs to Room Workspace.



Future implementations must preserve this separation.



Violations of this rule are considered architectural regressions.
