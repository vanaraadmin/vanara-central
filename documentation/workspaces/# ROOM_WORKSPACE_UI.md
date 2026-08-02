\# ROOM\_WORKSPACE\_UI.md



Status: UI Definition v1

Module: Room Workspace

Repository: Vanara Central

Owner: Product Design



\---



\# 1. Purpose



This document defines the visual composition of the Room Workspace.



It is not an implementation document.



It is the visual contract that every future implementation must follow.



Codex must implement this layout.



It must not redesign it.



\---



\# 2. General Philosophy



Room Workspace must feel like a premium mobile application.



Not like hotel software.



Not like a management ERP.



Not like an administration panel.



The visual inspiration is closer to:



Apple Home



↓



Apple Wallet



↓



Apple Health



than to a PMS.



\---



\# 3. Page Structure



The workspace always follows the same vertical rhythm.



```

────────────────────────────



Compact Room Row



↓



Expanded Hero



↓



Operational Summary



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



────────────────────────────

```



No section changes position.



The user builds muscle memory.



\---



\# 4. Compact Room Row



Height:



approximately 64–72 px.



The row contains:



Left



Room Name



Center



Operational summary



Right



Chevron



The entire row is tappable.



No action buttons.



\---



\# 5. Expansion



Expansion is vertical.



The row remains visible.



The workspace grows underneath it.



No page navigation.



No modal.



No overlay.



No bottom sheet.



The room itself becomes larger.



\---



\# 6. Hero



Hero image appears immediately.



Height:



180–220 px.



Radius:



same global card radius.



No shadow.



No border.



Only one official room photograph.



No carousel.



No slideshow.



No image gallery.



\---



\# 7. Operational Summary



Immediately below the hero.



Horizontal compact cards.



Examples:



Operating



Occupied



Ready



Maintenance



Each status occupies one small capsule.



No paragraph text.



No explanations.



Colour communicates state.



Text confirms meaning.



\---



\# 8. Guest Card



Appears only when occupied.



Layout:



Guest Name



Nationality



OTA



Arrival



Departure



Stay Duration



Everything fits inside one compact card.



No large spacing.



\---



\# 9. Reception Card



Small card.



Examples:



Passport



✓



Deposit



✓



Check-in



Completed



No editing.



Only operational state.



\---



\# 10. Housekeeping Card



Only current work.



Never history.



Examples:



Clean



Dirty



Cleaning In Progress



Cleaning



Water



On Demand



Actions remain inside this card.



Never leak outside.



\---



\# 11. Maintenance Card



If ticket exists:



compact summary.



If no ticket:



Report Issue.



Nothing else.



Blocking tickets appear immediately.



No need to open another page.



\---



\# 12. Notes



Very small.



Operational only.



Not a diary.



\---



\# 13. History



Compact timeline.



Newest first.



Only operational events.



No technical logs.



No IDs.



\---



\# 14. Card Language



Every section is visually a card.



All cards share:



same radius



same spacing



same typography



same padding



same behaviour



The content changes.



The visual language never changes.



\---



\# 15. White Space



White space is controlled.



The goal is density.



Not emptiness.



The user should almost never need excessive scrolling.



\---



\# 16. Colour



Colour is functional.



Never decorative.



Examples:



Green



Ready



Amber



Attention



Red



Blocking



Blue



Information



No gradients inside cards.



No colourful dashboards.



\---



\# 17. Icons



Icons only reinforce.



Never replace text.



Every important state still contains readable text.



\---



\# 18. Typography



Hierarchy:



Room Name



↓



Guest



↓



Operational Status



↓



Metadata



↓



History



Never use oversized text.



Never use tiny unreadable labels.



Readability always wins over compactness.



\---



\# 19. Images



Only one official accommodation image.



Never duplicate.



Never crop aggressively.



Never stretch.



Recognition is more important than artistic composition.



\---



\# 20. Responsive Behaviour



Desktop:



same vertical structure.



Only wider cards.



No second layout.



Tablet:



same behaviour.



Phone:



same behaviour.



The Room Workspace behaves identically on every device.



\---



\# 21. Global UI Rule



Room Workspace must feel like opening a physical folder containing everything known about one accommodation.



The user never feels lost.



The room always remains the visual anchor.



Everything else simply unfolds beneath it.

\---

\# 22. Expanded Operational Workspace Layer

Compact cards belong to the dark Home layer.

Expanded operational workspaces belong to the light operational layer.

When a compact room card expands into Room Workspace, the expanded area must visually detach from the Home screen.

Use:

\- background: Vanara Cream, #F7F4EE or the current design-system cream
\- primary text: dark forest green
\- secondary text: muted green/grey
\- cards inside: existing premium Vanara card treatment adapted for the cream layer

Do not keep a green workspace inside the green Home background.

The user should immediately perceive:

"I am now working inside this room."

not:

"The card became larger."

This same visual principle applies to every future expanded operational workspace in Rooms, Housekeeping, Reception, Maintenance, and Procurement.
