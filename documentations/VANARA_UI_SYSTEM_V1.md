# Vanara UI System v1

Status: frozen reference extracted from the approved Rooms Workspace.

Audience: PM Lead AI and implementation agents.

Purpose: this document is the architectural UI reference for future Vanara Central interface sprints. It describes the current approved implementation. It is not marketing copy, not user documentation, and not a redesign proposal.

Scope: the approved Rooms Workspace is the visual source of truth. Future workspaces must reuse the same visual grammar, materials, hierarchy, motion, density, and operational language.

Out of scope: backend behavior, API contracts, business logic, read models, permissions, room state derivation, and operational workflows.

## 1. Design Philosophy

Vanara Central uses material and operational hierarchy instead of decorative UI.

The approved Rooms Workspace establishes these principles:

- Material over decoration: glass, blur, shadow, reflection, and depth create hierarchy. Decorative shapes, bokeh, fake illustrations, or ornamental gradients are not part of the approved system.
- One continuous operational surface: the compact Rooms list and expanded Room sheet must feel connected. Expansion is an extraction from the list, not navigation to a separate visual product.
- Lifted operational sheets: when a room expands, it becomes a lifted forest-glass sheet. The sheet is elevated, slightly more luminous, and still visually part of the Rooms surface.
- Quiet hierarchy: the interface is premium because it is restrained. Labels, values, sections, and actions are clear without excessive cards or noise.
- Operational first: every visual element must answer an operational question. The UI should help staff understand room state and take the next correct action.
- Forest luxury: the palette is dark forest green, cream, muted botanical greens, restrained gold/warning tones, and soft semantic status color.
- Low visual noise: no oversized white dashboards inside green workspaces, no repeated large cards inside cards, no room hero photos in Rooms, no competing CTAs.
- Domain clarity: Rooms aggregates operational information, but each section keeps its own language. Housekeeping says cleaning. Reception says guest workflow. Maintenance says technical state.
- Premium density: density is compact but readable. The page should feel designed for daily operation, not for marketing display.

The Rooms Workspace must remain the reference for future UI implementation. Do not reinterpret the system from older screens.

## 2. Typography

### Font Families

Current global tokens:

- Display font: `--vc-font-display`: `"Marcellus", "Noto Serif Thai", Georgia, serif`
- Body font: `--vc-font-body`: `"Lato", "Noto Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Utility aliases currently used in Rooms CSS: `--vc-font-sans` and `--vc-font-ui` with fallback to body-style usage. Future extraction should map utility text to Lato without changing hierarchy.

Rules:

- Display and operational values use Marcellus.
- Utility labels, dates, metadata, compact signals, and actions use Lato.
- Do not import new fonts.
- Do not switch display text to a generic sans-serif.
- Do not apply negative letter spacing to compact labels or body text.

### Current Typography Scale

Global token scale:

- `--vc-text-xs`: 12px
- `--vc-text-sm`: 14px
- `--vc-text-md`: 16px
- `--vc-text-lg`: 18px
- `--vc-text-xl`: 22px
- `--vc-text-2xl`: 28px
- `--vc-text-3xl`: `clamp(36px, 8vw, 60px)`

Approved Rooms and Workspace visual levels:

| Level | Current size | Font | Weight | Usage |
| --- | ---: | --- | --- | --- |
| Workspace brand wordmark | `clamp(25.92px, 6vw, 30.72px)` | Marcellus | 400 | Vanara masthead wordmark |
| Workspace page title | `clamp(25.92px, 7vw, 36.8px)` | Marcellus | 400 | Page title such as Rooms |
| Sticky navigation title | 26px | Marcellus | 400 | Bottom morph navigation title |
| Expanded room identity name | `clamp(30px, 7vw, 38px)` | Marcellus | 400 | Room name inside expanded sheet |
| Expanded room identity guest | 20px | Marcellus | 400 | Guest name in identity header |
| Expanded section title | 24px | Marcellus | 400 | Guest, Room Status, Turnover, Housekeeping, Maintenance |
| Operational current state value | 24px | Marcellus | 400 | Current state in domain sections |
| Room status value | 20px | Marcellus | 400 | Operating, Occupied, Clean, Clear |
| Guest fact value | 20px | Marcellus | 400 | Arrived, Leaving, Stay |
| Domain fact value | 18px | Marcellus | 400 | Compact operational facts |
| Compact room name | 18px | Lato/inherited | 650 | Collapsed row room identity |
| Compact room guest | 12.48px | Lato | 500 | Collapsed row guest line |
| Compact primary signal | 11.52px | Lato | 600 | Occupancy and cleaning signals |
| Compact secondary signal | 10.56px | Lato | 600 | Secondary alerts |
| Expanded identity room type | 12px | Lato | 600 | Uppercase room type |
| Expanded identity stay dates | 13px | Lato | 600 | Arrival and departure dates |
| Section eyebrow | 11px | Lato | 600 | Section category label |
| Data label | 10px | Lato | 600 | Fact/status labels |
| Current state description | 13px | Lato | 500 | Operational explanation |
| Primary action label | 14px | Lato | 600 | Room action buttons |
| Summary counter value | 24px | Lato/inherited | 600 | Staff dashboard count in Rooms summary |
| Summary counter label | 11px | Lato | 700 | Summary label |
| Workspace date | approx 11.88px | Lato | 500 | Masthead date |
| Sticky nav date | approx 9.28px | Lato | 700 | Bottom nav date |

### Recommended Global Typography Scale

Future token extraction may increase the overall scale by approximately 8 percent while preserving the hierarchy above. This is a scale recommendation only. It must not change the approved visual hierarchy.

Suggested target scale:

- Utility micro: 11px to 12px
- Utility small: 12px to 13px
- Body small: 13px to 14px
- Body/action: 14px to 15px
- Compact room name: 18px to 19px
- Operational value: 20px to 22px
- Section title: 24px to 26px
- Sticky title: 26px to 28px
- Expanded identity: 30 to 38px becomes approximately 32 to 41px

Do not enlarge all levels equally if it damages compact operational density.

## 3. Spacing System

The global spacing system is a 4px base:

- `--vc-space-1`: 4px
- `--vc-space-2`: 8px
- `--vc-space-3`: 12px
- `--vc-space-4`: 16px
- `--vc-space-5`: 20px
- `--vc-space-6`: 24px
- `--vc-space-8`: 32px
- `--vc-space-10`: 40px
- `--vc-space-12`: 48px
- `--vc-space-16`: 64px

Approved Rooms usage:

- 2px: micro gap in compact identity and small metadata stacks.
- 3px: compact row and identity micro stack gap.
- 4px: summary item internal gap and compact fact rhythm.
- 5px: title top offset after eyebrow and domain fact gap.
- 7px to 8px: status value offset and summary item padding.
- 10px: compact mobile row gap and domain secondary gap.
- 12px: core section and body spacing, row expanded side padding, header gap, action icon gap.
- 14px: expanded section top rhythm, header bottom, status item horizontal padding.
- 16px: summary surface padding, section horizontal padding, identity gap.
- 17px to 18px: collapsed row vertical padding and expanded section padding.
- 20px: masthead gap.
- 22px: workspace shell side padding and expanded sheet padding top.
- 24px: list top padding and expanded sheet bottom.
- 30px: workspace intro bottom padding.
- 32px: desktop bottom nav offset.
- 40px: large vertical system rhythm where needed.
- 42px: workspace intro top padding.

Rules:

- Use 4px-derived spacing wherever possible.
- Preserve compact operational density.
- Avoid arbitrary vertical padding above 24px inside operational cards/sheets.
- Do not create nested cards with repeated 24px to 32px padding.
- Touch targets must remain at least 44px. Primary room actions are currently 54px.

## 4. Glass Material

### Glass List

Class reference: `.vc-glass-surface`.

Used for:

- Rooms summary surface.
- Rooms list surface.

Current material:

- Background: linear 145deg, `rgba(220,235,223,0.11)` to `rgba(170,210,185,0.05)` to `rgba(8,40,30,0.16)`.
- Border: `1px solid rgba(255,255,255,0.16)`.
- Radius: 28px.
- Blur: `blur(18px) saturate(120%)`.
- Shadow: inset top 18 percent white, inset bottom 3 percent white, outer `0 18px 42px rgba(0,0,0,0.18)`.
- Reflection: one diagonal `::before` reflection from 18 percent to 58 percent.

Use when:

- A list or summary belongs to the dark workspace background.
- Several operational rows share one surface.

Do not use when:

- The content is an extracted working area. Use Glass Sheet instead.
- The content is a small local section inside a sheet. Use Glass Region instead.

### Glass Sheet

Class reference: `.room-expanded-sheet`; future reusable class: `.vc-glass-sheet`.

Used for:

- Expanded Room workspace inside Rooms.

Current material:

- Background: linear 145deg from `rgba(218,235,222,0.15)` to `rgba(129,177,150,0.085)` to `rgba(10,43,32,0.24)`.
- Border: `1px solid rgba(238,243,234,0.24)`.
- Radius: 30px, with 18px top corners when tucked below selected row.
- Blur: `blur(22px) saturate(122%)`.
- Shadow: inset top `rgba(255,255,255,0.21)`, inset bottom `rgba(255,255,255,0.045)`, outer `0 8px 18px rgba(0,15,10,0.16)`, outer `0 28px 72px rgba(0,13,9,0.26)`.
- Reflection: one `::before` diagonal reflection with max `rgba(255,255,255,0.072)`.
- Lifted edge: `::after` radial edge, top -9px, height 18px, filtered blur 7px.
- Isolation: `isolation: isolate`.

Use when:

- A compact item expands into an operational workspace.
- The user should feel the selected row has been lifted and unfolded.

Do not use when:

- Rendering a normal compact card.
- Rendering a small data group.
- Rendering a page background.
- Rendering a modal or drawer.

### Glass Region

Class reference: `.room-expanded-section`; future reusable class: `.vc-glass-region`.

Used for:

- Guest section.
- Room Status section.
- Turnover section.
- Housekeeping section.
- Maintenance section.

Current material:

- Background: linear 145deg from `rgba(238,244,236,0.075)` to `rgba(182,211,191,0.032)`.
- Border: `1px solid rgba(235,241,233,0.12)`.
- Radius: 22px.
- Shadow: inset top `rgba(255,255,255,0.085)`.
- No extra reflection per region.

Use when:

- Grouping related operational information inside a glass sheet.
- A section needs hierarchy without becoming a heavy standalone card.

Do not use when:

- Another glass region is already sufficient.
- The area would become card-inside-card.
- The content is a compact row.

### Summary Glass

Class references: `.rooms-home__summary`, `.rooms-summary-item`, `.vc-glass-surface`.

Current layout:

- Summary grid uses 2 columns by default and 4 columns at 760px and above.
- Surface padding: 16px.
- Counter value: 24px.
- Counter label: 11px uppercase.

Use when:

- Showing a small number of mutually exclusive executive counters.

Do not use for:

- Housekeeping concepts inside Rooms.
- Detailed operational status.
- Long text.

### Navigation Glass

Class references: `.sticky-glass-nav-positioner`, `.sticky-glass-nav-surface`.

Current material:

- Position: fixed bottom navigation.
- Mobile bottom: `calc(104px + env(safe-area-inset-bottom))`.
- Desktop bottom: 32px.
- Width: `calc(100vw - 36px)`, max 560px, desktop max 620px.
- Height: 88px mobile, 84px desktop.
- Grid: `72px minmax(0, 1fr) 150px`.
- Border: `1px solid rgba(237,241,232,0.26)`.
- Radius: 28px.
- Background: same family as secondary glass button.
- Blur: `blur(14px) saturate(112%)`.
- Shadow: inset top `rgba(255,255,255,0.20)`, inset bottom `rgba(255,255,255,0.045)`, outer `0 16px 42px rgba(0,12,9,0.16)`.
- Reflection: one diagonal `::before`.

Use when:

- Global workspace navigation needs to remain reachable after scroll.
- Returning to top via logo/title surface.

Do not use as:

- A traditional toolbar.
- A second page header.
- A menu replacement.

## 5. Component Inventory

### Workspace Shell

Purpose: provides the dark background, hero identity, date, workspace number, sticky navigation, body, and canopy.

Parent: top-level workspace page.

Children:

- WorkspaceHero.
- StickyGlassHeader.
- Workspace section marker.
- Workspace body.
- Workspace canopy.

Reuse policy:

- Every operational workspace must use the same shell.
- Do not create separate visual shells per role.
- Background image is mapped centrally by workspace key.

### Workspace Hero

Purpose: primary page identity at load.

Current elements:

- Vanara logo.
- Wordmark.
- Page title.
- Date.
- Optional hero action.

Reuse policy:

- Keep as the source of page identity.
- Sticky navigation morphs from the hero logo.
- Do not create a second independent hero for a workspace.

### Bottom Morph Navigation

Purpose: persistent navigation identity and return-to-top action after scroll.

Parent: WorkspaceShell.

Children:

- Logo target.
- Page title.
- Current date.

Reuse policy:

- Use one global component.
- Do not duplicate logos.
- Do not create page-specific bottom navigation variants.

### Glass List

Purpose: compact operational collection surface.

Parent: workspace body.

Children:

- Rows.
- Summary items.

Reuse policy:

- Use for compact operational lists.
- Rows should not be independent cards.

### Compact Room Row

Purpose: one compact room overview and expansion trigger.

Current structure:

- Accommodation icon, 32px mark slot.
- Room name and optional guest.
- Primary/secondary operational signals.
- Chevron.

Layout:

- Grid columns: `40px minmax(0, 1fr) auto 18px`.
- Min height: 96px.
- Padding: 17px 18px.

Reuse policy:

- Future compact rows in other workspaces should use the same density logic.
- Do not place status pill clouds inside rows.
- Limit secondary signal count.

### Glass Sheet

Purpose: expanded operational workspace extracted from a list item.

Parent: Glass List.

Children:

- Identity header.
- Glass Regions.

Reuse policy:

- Use when an operational row expands into a temporary workspace.
- Do not convert to modal or full-screen drawer unless Product explicitly changes the model.

### Sheet Identity Header

Purpose: identifies the selected operational object.

Current Room implementation:

- Icon slot: 68px.
- Grid: `76px minmax(0, 1fr)`.
- Min height: 104px.
- Room type label.
- Room name.
- Guest name or no guest text.
- Stay dates or room type.

Reuse policy:

- Replace object data but keep structure.
- Use icons, not photos, for Rooms.
- Do not make the identity header a white card.

### Glass Region

Purpose: local section inside a sheet.

Children:

- Section Header.
- Section content.
- Optional state marker.
- Optional action.

Reuse policy:

- Use for each operational domain section.
- Do not stack additional heavy cards inside it.

### Section Header

Purpose: consistent domain label and title.

Current structure:

- Eyebrow: uppercase, 11px Lato, 600, letter spacing 0.11em.
- Title: 24px Marcellus, 400.
- Optional state marker on the right.

Reuse policy:

- Every Glass Region should use this structure.
- Do not invent decorative icons in section headers.

### Data Grid

Purpose: compact status values with separators, not individual cards.

Current Room Status:

- Grid: 2 columns.
- Border top and left on grid.
- Each item uses border right and bottom.
- Padding: 16px 14px.
- Label: 10px uppercase.
- Value: 20px Marcellus.

Reuse policy:

- Use for comparable operational attributes.
- Do not give each item rounded box backgrounds.

### Facts Row

Purpose: compact related facts such as Arrived, Leaving, Stay.

Current layout:

- 3 columns.
- Internal separators only.
- Label: 10px uppercase.
- Value: 20px Marcellus.
- Narrow screens under 370px stack vertically with top separators.

Reuse policy:

- Use for 2 to 4 compact facts.
- Do not use large cards for each fact.

### Operational State

Purpose: one current state plus explanation.

Current structure:

- Label: 10px uppercase.
- Value: 24px Marcellus.
- Description: 13px Lato.
- Top separator.

Reuse policy:

- Use in Turnover, Housekeeping, Maintenance, and future domain sections.
- State value receives semantic luminance.
- Do not expose raw task ids, timestamps, or database terminology.

### Primary Action

Purpose: one dominant next action for the section.

Current style:

- Min height: 54px in expanded sheet.
- Full width.
- Border: `rgba(238,243,234,0.18)`.
- Background: `rgba(31,90,66,0.96)`.
- Text: cream.
- Label size: 14px.
- Focus: 2px solid `rgba(242,235,213,0.74)`.

Reuse policy:

- Use one primary action per operational section.
- Preserve action availability from capabilities.
- Do not add fake disabled actions.

### Secondary Action

Purpose: low-emphasis navigation/action such as Staff Home.

Current style:

- Min height: 38px.
- Pill radius.
- Border: `rgba(237,241,232,0.26)`.
- Background: glass gradient.
- Blur: 14px.
- Font: 10.56px uppercase Lato.

Reuse policy:

- Use for supporting actions only.
- Do not compete with primary operational action.

## 6. Motion

### Bottom Morph Navigation

Current behavior:

- WorkspaceShell owns scroll progress.
- Progress is computed from the sticky trigger position using IntersectionObserver and requestAnimationFrame.
- Progress is clamped from 0 to 1.
- StickyGlassHeader consumes `heroLogoRef` and `progress`.
- Logo uses FLIP-like geometry from hero logo to compact nav target.
- Glass surface exists permanently and animates only through progress.

Current values:

- Surface opacity: progress.
- Pointer events: enabled after progress > 0.05.
- TranslateY: `(1 - progress) * 24px`.
- Scale: 0.985 to 1.
- Transition: 280ms cubic-bezier(0.22, 1, 0.36, 1).
- Compact logo visible only at progress >= 0.995.

Rules:

- Do not mount and unmount the header for animation.
- Do not create a second logo.
- Do not use keyframes for the morph.
- Do not add multiple navigation sounds or page-specific sounds.

### Lifted Sheet

Current animation:

- Name: `room-sheet-lift-in`.
- Duration: 260ms.
- Timing: cubic-bezier(0.22, 1, 0.36, 1).
- Origin: top center.
- From: opacity 0, translateY(-10px), scaleY(0.985), scaleX(0.992), brightness 0.92.
- To: opacity 1, translateY(0), scale(1), brightness 1.

Rules:

- Animate only the sheet entrance.
- Do not animate every internal section separately.
- No bounce, spring, overshoot, or slow theatrical motion.
- Reduced motion disables sheet animation.

### Compact Row Transitions

Current transitions:

- Background, color, and transform: 140ms standard ease.
- Chevron rotation: 180ms standard ease.
- Row active state translates 1px down.

Rules:

- Keep rows responsive and quiet.
- Do not animate height with arbitrary timers.

### Reduced Motion

Current foundations:

- Global reduced motion shortens animation and transition durations to 1ms.
- Rooms-specific reduced motion disables sheet animation and action transitions.

Future work:

- Every new motion component must explicitly support `prefers-reduced-motion`.

## 7. Operational Color System

Current semantic color usage is expressed primarily through rgba tones on dark glass.

### Base Palette

Global colors:

- Jungle 950: `#10271e`
- Jungle 900: `#173b2d`
- Jungle 800: `#214b39`
- Jungle 700: `#2c5e47`
- Jungle 600: `#397458`
- Sand 100: `#f7f4ee`
- Workspace cream: `#f4eddf`
- Gold 500: `#b28a46`
- Success: `#2c6a4d`
- Warning: `#9a6037`
- Danger: `#a33f36`
- Info: `#365f7d`

### Approved Status Treatments

Clean / success:

- Pill border: `rgba(139,196,147,0.34)`.
- Pill text: `rgba(232,255,236,0.98)`.
- Pill background: `rgba(139,196,147,0.15)`.

In progress / info / occupied:

- Pill border: `rgba(139,180,202,0.36)`.
- Pill text: `rgba(232,247,255,0.98)`.
- Pill background: `rgba(139,180,202,0.16)`.

Neutral / vacant / closed support:

- Pill border: `rgba(244,237,223,0.2)`.
- Pill text: `rgba(255,250,240,0.82)`.
- Pill background: `rgba(244,237,223,0.09)`.

Dirty / warning:

- Pill border: `rgba(208,166,99,0.34)`.
- Pill text: `rgba(255,239,211,0.98)`.
- Pill background: `rgba(208,166,99,0.16)`.

Critical / maintenance blocking:

- Pill border: `rgba(210,139,126,0.36)`.
- Pill text: `rgba(255,236,232,0.98)`.
- Pill background: `rgba(210,139,126,0.17)`.

### Luminance Rules

Prominent status text inside the expanded sheet uses:

`text-shadow: 0 0 14px color-mix(in srgb, currentColor 16%, transparent);`

Apply this only to:

- Room Status values.
- Operational State values.

Do not apply glow to:

- Body copy.
- Labels.
- Metadata.
- Dates.
- Section descriptions.

The result must be brighter, not neon.

## 8. Layout Rules

### Workspace Layout

Current shell:

- Page background is fixed through WorkspaceShell.
- Width: 480px max by default.
- Desktop width: 540px max at 760px and above.
- Side padding: 22px, reduced to 16px under 380px.
- Top padding: safe area plus 22px, desktop safe area plus 30px.
- Body bottom padding: 10px.

Rules:

- Future workspaces should keep the same centered operational column.
- Do not create full-width dashboards unless Product explicitly approves.

### Summary

Current Rooms summary:

- First operational surface inside body.
- Glass List material.
- 2 columns mobile, 4 columns desktop.
- Only executive counters.

Rules:

- Summary must stay compact.
- Summary counts must represent authoritative operational data.
- Do not mix domain concepts into summary counters.

### List

Current Rooms list:

- One glass surface.
- Rows are separated by borders.
- Rows are not cards.
- Last row removes bottom border.
- Expanded row remains above sheet with `z-index: 2`.

Rules:

- Do not make each row a floating card.
- Do not let row signal areas wrap into pill clouds.
- The list is a scanning surface.

### Expanded Sheet

Current Rooms expanded sheet:

- Mounted directly below selected row.
- Starts with `margin-top: -1px` on wrapper.
- Sheet begins immediately below selected row.
- Top radius can tuck under row at 18px.
- Internal regions use 14px vertical rhythm.

Rules:

- Expanded content belongs visually to the selected row.
- Do not create a white or cream dashboard inside the dark workspace.
- Do not duplicate a full room page.

### Data Sections

Current structure:

- Section Header.
- Section content.
- Optional data grid or current state.
- Optional primary action at bottom.

Rules:

- No heavy nested cards.
- Use separators, typography, and compact grids.
- Keep section purpose clear.

### Navigation

Current global navigation:

- Bottom morph glass nav.
- Overlays content while scrolling.
- Actions remain reachable by scrolling.

Rules:

- Do not redesign bottom navigation inside workspace sprints.
- Do not create a second sticky header.

## 9. Replication Rules

This section is mandatory for future PM Lead AI prompts.

### Global Rule

All future UI work must reuse the Vanara UI System v1 extracted from Rooms. Do not create page-specific visual systems.

### Staff Home

Staff Home must reuse:

- Glass List for compact workspace groups where appropriate.
- Summary Glass for executive counters.
- Section Header hierarchy.
- Primary and secondary action styles.
- Same typography scale and semantic colors.

Staff Home must not:

- Become a marketing landing page.
- Use independent card-heavy layouts that conflict with Rooms.
- Use operational counters with different visual treatment from Rooms.

### Reception

Reception must reuse:

- WorkspaceShell.
- Glass List for daily movement lists.
- Glass Sheet when a movement row expands.
- Glass Region for Passport, Deposit, Check-in, and Check-out domains.
- Data Grid for compact state facts.
- Operational State for current workflow stage.

Reception must not:

- Become the primary room browser.
- Use room cleaning language.
- Use separate Reception-only materials.

### Housekeeping

Housekeeping must reuse:

- Glass List for task queues.
- Glass Sheet for expanded task execution when appropriate.
- Operational State for current work status.
- Primary Action for Start/Finish actions.
- Status luminance rules.

Housekeeping must not:

- Display room browser information.
- Use detailed room dashboard sections inside task execution.
- Recreate action styling.

### Maintenance

Maintenance must reuse:

- Glass List for ticket queues.
- Glass Sheet for expanded ticket/work surfaces.
- Glass Region for target, current state, and issue summary.
- Critical/warning semantic colors from Rooms.
- Primary and secondary actions.

Maintenance must not:

- Invent severity visual systems beyond current product rules.
- Create separate red/orange-heavy pages.
- Duplicate room alert materials.

### Procurement

Procurement must reuse:

- WorkspaceShell.
- Summary Glass for current stock/request counters.
- Glass List for item/request queues.
- Data Grid for compact item facts.
- Primary Action for approved procurement actions.

Procurement must not:

- Use spreadsheet-like dense tables as the first visual language.
- Create a separate beige procurement theme.

### Chat

Chat must reuse:

- WorkspaceShell.
- Glass regions for message groups.
- Existing floating chat button rules.
- Utility typography for metadata.

Chat must not:

- Redesign the floating chat button during unrelated workspace sprints.
- Introduce independent messaging material.

### Settings

Settings is future work. When implemented it must reuse:

- WorkspaceShell.
- Glass List for settings categories.
- Glass Region for grouped settings.
- Data Grid for small settings state.
- Primary/secondary actions.

Settings must not:

- Become an enterprise admin dashboard.
- Use a separate Owner visual product.

## 10. Implementation Rules

Strict rules for future Codex implementation:

1. Never create page-specific glass materials.
2. Never duplicate typography scales inside page CSS.
3. Never hardcode arbitrary spacing outside the approved scale unless matching an existing approved value.
4. Never recreate shadows manually when a shared material exists.
5. Always reuse WorkspaceShell for operational pages.
6. Always reuse bottom morph navigation from WorkspaceShell.
7. Always reuse the same compact row/list density where a workspace presents scan-first operational rows.
8. Always separate Glass List, Glass Sheet, and Glass Region responsibilities.
9. Never put a Glass Region inside another Glass Region unless Product explicitly approves.
10. Never use white or cream cards inside dark glass workspaces unless the approved design system creates a specific light layer.
11. Never add room photographs to Rooms expanded workspace.
12. Never add decorative icons to section headers.
13. Never use fake data to fill visual structure.
14. Never expose backend enum names, database fields, or internal ids in UI copy.
15. Always preserve action availability from server capabilities.
16. Never use role permissions to create different visual layouts.
17. Permissions may hide sensitive information or administrative actions only.
18. Always use semantic status colors consistently.
19. Always support reduced motion.
20. Always validate source tests, typecheck, lint, and build after UI extraction work.
21. If a component becomes shared, move the React presentation component and CSS token/material together.
22. Do not copy-paste Rooms CSS into other pages. Extract shared classes first.
23. Do not redesign frozen navigation or chat while applying this system elsewhere.
24. Keep UI language operational and domain-specific.
25. Every future prompt must specify which existing component/material is being reused.

## 11. Future Sprints

Recommended order for applying Vanara UI System v1:

1. Staff Home
   - Align workspace cards and counters to Summary Glass, Glass List, and compact operational hierarchy.
   - Keep Booking Pulse behavior unchanged unless Product issues a separate rule.

2. Reception
   - Convert movement surfaces to the same list and lifted sheet model.
   - Keep guest workflow language independent from room cleaning.

3. Housekeeping
   - Apply Glass List and task execution sheet only where execution requires expansion.
   - Preserve Housekeeping as a task workspace, not a room browser.

4. Maintenance
   - Apply target/ticket flow using Glass List, Glass Sheet, and Glass Region.
   - Preserve current Maintenance product model.

5. Procurement
   - Apply summary, list, and compact facts without introducing table-first enterprise UI.

6. Chat
   - Align message surfaces and metadata to utility hierarchy.
   - Preserve floating chat behavior.

7. Settings
   - Build only after operational workspaces have adopted the system.
   - Use the same Staff/Owner visual model.

## Frozen Reference Checklist

Before any future UI implementation, the PM Lead AI must verify:

- The sprint names the exact existing material to reuse.
- The sprint does not ask for a new visual system.
- The sprint preserves WorkspaceShell.
- The sprint preserves bottom morph navigation unless explicitly targeted.
- The sprint does not introduce role-specific layouts.
- The sprint separates operational domains.
- The sprint does not reintroduce room hero photographs.
- The sprint does not create card-inside-card layouts.
- The sprint does not use white dashboards inside forest workspaces.
- The sprint states which source tests should be updated as guardrails.

Vanara UI System v1 is the approved visual constitution for future UI work.
