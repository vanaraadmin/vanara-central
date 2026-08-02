\# ROOM\_WORKSPACE\_INTERACTIONS.md



Status: Interaction \& Motion Architecture v1

Module: Room Workspace

Repository: Vanara Central

Owner: UX / Motion Design



\---



\# 1. Purpose



This document defines how Room Workspace behaves.



Not how it looks.



Every interaction must feel intentional.



Every movement must have meaning.



Vanara does not use animation for decoration.



Motion communicates state.



\---



\# 2. Design Philosophy



The user should never wonder:



"What happened?"



Every interaction should answer that question visually.



Nothing should suddenly appear.



Nothing should suddenly disappear.



Everything should naturally unfold.



\---



\# 3. Global Principle



Vanara never navigates when it can reveal.



Navigation is expensive.



Disclosure is cheap.



Therefore:



Tap



↓



Reveal



instead of



Tap



↓



New Page



\---



\# 4. Room Expansion



Initial state



Compact Room Row



Tap



↓



Expand



The room grows vertically.



The original row remains visible.



The user never loses orientation.



\---



\# 5. Expansion Animation



Movement direction



Top



↓



Bottom



Duration



approximately 180–220ms



Feeling



Soft



Controlled



No bounce.



No spring.



No overshoot.



The room simply unfolds.



\---



\# 6. Collapse



Collapse follows the opposite direction.



Bottom



↓



Top



The room quietly returns to its compact state.



No fade-out.



No disappearing content.



\---



\# 7. One Expanded Room



Only one room may remain expanded.



Opening another room



↓



Previous collapses



↓



New room expands



The user always knows where focus moved.



\---



\# 8. Outside Click



Room Workspace follows the global Vanara Dismissable Layer.



Tap outside



↓



Collapse



Desktop



ESC



↓



Collapse



No Close button.



Never.



\---



\# 9. Scrolling



Expanding a room must NOT reset page position.



The room expands inside the current scroll.



The user keeps context.



The page must never jump unexpectedly.



\---



\# 10. Hero Behaviour



Hero image never animates independently.



It simply appears together with the expanded workspace.



No zoom.



No parallax.



No slideshow.



Recognition is more important than visual effect.



\---



\# 11. Cards



Every card appears progressively.



Operational



↓



Guest



↓



Reception



↓



Housekeeping



↓



Maintenance



↓



Notes



↓



History



The user discovers information naturally.



Not all at once.



\---



\# 12. Actions



Buttons never fly around.



No floating action buttons.



Every action belongs to its own card.



Actions appear only when relevant.



\---



\# 13. State Changes



Whenever an operational state changes:



Ready



↓



Not Ready



Maintenance



↓



Completed



Passport



↓



Collected



The UI updates immediately.



No page refresh.



No reload feeling.



Only the affected card changes.



\---



\# 14. Loading



Loading should feel lightweight.



Skeletons only where needed.



Never block the entire Room Workspace.



If Guest is loading



Guest loads.



Maintenance remains visible.



\---



\# 15. Optimistic Updates



Whenever safe:



User action



↓



Immediate visual response



↓



Backend confirmation



↓



Silent confirmation



If backend rejects:



Return to previous state.



Display concise error.



\---



\# 16. Error Behaviour



Errors never occupy the entire screen.



Only the affected card displays the problem.



The room remains usable.



\---



\# 17. Empty Sections



Empty sections collapse naturally.



No Guest



↓



Guest Card hidden.



No Maintenance



↓



Maintenance Card becomes:



Report Issue



No Water



↓



No Water section.



The user should never scroll through empty containers.



\---



\# 18. Sticky Elements



Only persistent actions become sticky.



Examples:



Passport Review



Maintenance Action Bar



Never make Room Workspace sticky by default.



The room should scroll naturally.



\---



\# 19. Touch Targets



Minimum height



44 px



Never smaller.



Buttons should be comfortably usable with wet hands.



This application is used inside a tropical resort.



Practical usability wins over minimalism.



\---



\# 20. Readability



Readability always wins over compactness.



If a label is difficult to read:



Increase font size.



Do not compress information until it becomes uncomfortable.



Target users are operational staff.



Not designers.



\---



\# 21. Motion Hierarchy



Motion priority



1\.



Room expansion



2\.



Card appearance



3\.



State updates



4\.



Small button feedback



Nothing else.



No decorative motion.



No idle animation.



No looping effects.



\---



\# 22. Visual Focus



Every screen must have exactly one visual focus.



Never two.



Examples



Collapsed room



↓



Room Name



Expanded room



↓



Hero



Maintenance ticket



↓



Blocking badge



Guest



↓



Guest Name



The eye should always know where to look first.



\---



\# 23. Animation Rules



Allowed



Opacity



Translate Y



Small scale (<2%)



Forbidden



Rotation



Flip



3D transforms



Elastic bounce



Long easing



Confetti



Decorative effects



Vanara is calm.



\---



\# 24. Permanent Interaction Rules



The following become global Design System rules.



Tap outside



↓



Dismiss



One expanded entity at a time.



No Close buttons.



Progressive disclosure.



Contextual actions only.



Readability before density.



Motion communicates state.



Motion never decorates.



\---



\# 25. Future Design System Integration



This document becomes the foundation of:



VANARA\_DESIGN\_SYSTEM.md



Every future module must reuse these interaction rules.



Housekeeping.



Maintenance.



Reception.



Procurement.



Chat.



Dashboard.



Future modules must not invent different interaction models.
