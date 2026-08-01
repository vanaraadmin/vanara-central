# Vanara Central

## 11 - Operations UI Modules

### Functional Product Specification v1.0

**Status:** FROZEN BASELINE

------------------------------------------------------------------------

# Purpose

This document defines the functional scope and user interface
requirements for the operational modules of Vanara Central.

Its purpose is to ensure that any future developer, designer or AI agent
understands:

-   which modules must be built;
-   who will use them;
-   what information each screen must show;
-   which actions must be possible;
-   which workflows are intentionally excluded;
-   how every module must interact with the backend.

This is a product and UI specification.

It does not replace the backend architecture documents.

------------------------------------------------------------------------

# Product Context

Vanara Central is a single-resort operational platform for Vanara Resort
Koh Chang.

It is not a multi-property SaaS product.

The interface must therefore prioritize:

-   speed;
-   clarity;
-   staff usability;
-   mobile-first operation;
-   minimal training;
-   direct use of Vanara room names;
-   current operational state.

The application will primarily be used through a LINE LIFF interface or
a similarly lightweight mobile web application.

------------------------------------------------------------------------

# Core Product Constraints

## Single Resort

The product manages Vanara Resort only.

The UI must not include:

-   property selectors;
-   tenant selectors;
-   organization switching;
-   multi-resort administration;
-   generic hotel setup flows.

------------------------------------------------------------------------

## Current State Over Historical Complexity

The system should store and display the current operational state.

It should not become a full historical timeline platform.

Keep only:

-   current room state;
-   current tasks;
-   current incidents;
-   minimal operational logs;
-   timestamps required for accountability;
-   synchronization and system diagnostics.

Avoid building a complete history of every room change unless it later
becomes operationally necessary.

------------------------------------------------------------------------

## Mobile First

Primary staff workflows must work comfortably on a phone.

Design rules:

-   large touch targets;
-   short labels;
-   minimal typing;
-   clear status colours;
-   one primary action per screen;
-   no dense desktop tables for staff workflows;
-   important information visible without horizontal scrolling.

Desktop layouts may be richer for Owner and Manager views.

------------------------------------------------------------------------

## Online Only

Offline mode is intentionally excluded.

When Wi-Fi is unavailable, staff will use mobile data.

The UI should:

-   detect failed network calls;
-   display a clear retry action;
-   never pretend that unsaved data has been stored;
-   avoid complex offline synchronization.

------------------------------------------------------------------------

## Backend-Only Data Access

The UI reads and writes only through Vanara Central APIs.

The UI must never:

-   call Beds24 directly;
-   know Beds24 identifiers;
-   reproduce booking or pricing logic;
-   implement business rules independently.

------------------------------------------------------------------------

# User Roles

The initial role model includes:

## Owner

Primary users:

-   Stefano
-   JF

Owner can view and manage all operational modules.

------------------------------------------------------------------------

## Manager

Can coordinate daily operations, assign priorities and resolve issues.

------------------------------------------------------------------------

## Reception

Can manage arrivals, departures, guest information, room readiness and
operational questions.

------------------------------------------------------------------------

## Housekeeping

Can view assigned rooms, update cleaning progress, complete checklists
and report issues.

------------------------------------------------------------------------

## Maintenance

Can view maintenance incidents, update their status and escalate
unresolved issues.

------------------------------------------------------------------------

## AI Service

Can answer authorized operational questions through backend APIs.

AI is not a human role and must not receive unrestricted system access.

------------------------------------------------------------------------

# Navigation Structure

Recommended main navigation:

1.  Today
2.  Rooms
3.  Housekeeping
4.  Maintenance
5.  Guests
6.  Ask Waraporn
7.  Owner Dashboard
8.  Settings

The interface may hide modules based on role.

Staff should land directly on the most useful module for their work.

------------------------------------------------------------------------

# Module 1

## Today / Daily Operations

### Purpose

Provide a single operational view of what matters today.

This should be the primary screen for Reception, Manager and Owner.

### Main Sections

#### Arrivals Today

Show:

-   room name;
-   guest name;
-   expected arrival time, when known;
-   number of guests;
-   room readiness;
-   special notes;
-   transport request;
-   payment or deposit warning, if applicable.

Primary actions:

-   open booking;
-   confirm room readiness;
-   add arrival note;
-   mark guest arrived;
-   contact or escalate.

------------------------------------------------------------------------

#### Departures Today

Show:

-   room name;
-   guest name;
-   expected departure time, when known;
-   confirmed or unconfirmed check-out;
-   housekeeping priority;
-   outstanding issue;
-   key status, if later implemented.

Primary actions:

-   mark checked out;
-   create cleaning task;
-   add departure note;
-   report damage or missing item.

------------------------------------------------------------------------

#### Rooms Requiring Attention

Examples:

-   not ready for an arrival;
-   cleaning incomplete;
-   maintenance issue open;
-   damage reported;
-   room status unclear;
-   synchronization warning.

This section must highlight only actionable exceptions.

------------------------------------------------------------------------

#### Daily Priorities

Owner or Manager can set a short list of priorities for the day.

Examples:

-   prepare checkout rooms first;
-   Villa 10 priority;
-   inspect blankets for humidity smell;
-   verify air conditioning;
-   repair bamboo fence.

This is not intended to become a complex project management system.

------------------------------------------------------------------------

### UI Behaviour

The Today screen should use clear operational cards.

Recommended status language:

-   Ready
-   Cleaning
-   To Clean
-   Occupied
-   Check-out Due
-   Maintenance
-   Blocked
-   Inspection Needed

------------------------------------------------------------------------

# Module 2

## Rooms Overview

### Purpose

Provide the current state of every accommodation unit.

### Supported Units

The system uses Vanara names only:

-   Bungalow 1--9
-   Bungalow 11--12
-   Villa 10
-   Villa 13
-   Yurt 1--6

No provider identifiers should be visible.

------------------------------------------------------------------------

### Room Card

Each room card should show:

-   unit name;
-   accommodation type;
-   current occupancy;
-   current guest, when occupied;
-   arrival date;
-   departure date;
-   operational status;
-   cleaning status;
-   maintenance warning;
-   last meaningful update.

------------------------------------------------------------------------

### Room Statuses

Recommended room operational statuses:

-   Available
-   Reserved
-   Occupied
-   Check-out Due
-   Vacant Dirty
-   Cleaning
-   Ready
-   Inspection Needed
-   Maintenance
-   Blocked

The backend should own allowed transitions.

------------------------------------------------------------------------

### Filters

Useful filters:

-   all rooms;
-   arrivals;
-   departures;
-   occupied;
-   to clean;
-   ready;
-   maintenance;
-   blocked.

Avoid excessive filters.

------------------------------------------------------------------------

### Room Detail Screen

The room detail screen should combine:

-   current booking;
-   guest summary;
-   arrival/departure dates;
-   current room status;
-   housekeeping checklist;
-   open maintenance incidents;
-   damage reports;
-   operational notes;
-   permitted actions.

The screen should represent the current operational truth for that room.

------------------------------------------------------------------------

# Module 3

## Housekeeping

### Purpose

Give housekeeping staff a simple workflow for preparing rooms.

### Housekeeping Queue

Rooms should be ordered by operational priority.

Suggested priority logic:

1.  same-day arrivals not ready;
2.  rooms checked out today;
3.  rooms needed for possible new bookings;
4.  occupied-room service requests;
5.  routine or lower-priority work.

The backend should calculate priority whenever possible.

------------------------------------------------------------------------

### Task Card

Show:

-   room name;
-   task type;
-   priority;
-   guest arrival deadline;
-   current status;
-   special instructions;
-   maintenance warning.

Primary actions:

-   Start
-   Pause
-   Report Issue
-   Ready for Inspection
-   Complete

------------------------------------------------------------------------

### Cleaning Statuses

Recommended states:

-   To Clean
-   In Progress
-   Waiting
-   Ready for Inspection
-   Ready
-   Blocked

------------------------------------------------------------------------

### Ready Checklist

A simple room-ready checklist must be included.

It should be configurable without becoming a complex form builder.

Initial checklist examples:

-   bed prepared;
-   linen clean and fresh;
-   towels present;
-   bathroom cleaned;
-   floor cleaned;
-   rubbish removed;
-   amenities checked;
-   lights checked;
-   air conditioning checked;
-   room smells fresh;
-   terrace or exterior checked;
-   door and lock checked.

Special seasonal or room-specific checks may include:

-   blankets checked for humidity smell;
-   air conditioning switched on before arrival;
-   mosquito or gecko check;
-   external bathroom platform checked for yurts.

------------------------------------------------------------------------

### Checklist Rules

-   checklist is room-specific or room-type-specific where useful;
-   mandatory items must be completed before Ready;
-   staff can report a blocking issue directly from an item;
-   checklist should be fast to complete on mobile;
-   avoid long text unless a problem is reported.

------------------------------------------------------------------------

### Inspection

Inspection should remain lightweight.

Possible workflow:

Housekeeping

↓

Ready for Inspection

↓

Manager or authorized staff

↓

Ready

For simpler operation, authorized housekeeping staff may be permitted to
mark a room directly Ready.

This should be configurable.

------------------------------------------------------------------------

### Occupied-Room Service

The system may support simple guest service tasks such as:

-   cleaning requested;
-   towel replacement;
-   linen replacement;
-   rubbish collection;
-   water or amenities request.

This is not a full guest-service ticketing platform.

------------------------------------------------------------------------

# Module 4

## Check-in and Check-out

### Purpose

Support Reception and Operations with clear arrival and departure
workflows.

------------------------------------------------------------------------

## Check-in Workflow

The screen should show:

-   guest name;
-   room name;
-   stay dates;
-   number of guests;
-   booking source;
-   room readiness;
-   arrival time;
-   transport notes;
-   special notes;
-   deposit status;
-   passport status.

Recommended actions:

-   confirm arrival;
-   register guest;
-   capture passport;
-   record deposit;
-   assign or confirm room;
-   mark checked in;
-   add operational note.

Room assignment changes must respect backend rules and provider
synchronization strategy.

------------------------------------------------------------------------

## Passport Capture

Photos are allowed only for operationally justified uses.

Passport capture requirements:

-   camera upload from phone;
-   clear consent and purpose;
-   access limited by role;
-   no use in general chat or unrelated modules;
-   retention policy should be configurable;
-   avoid unnecessary duplicate copies.

Passport photos are one of the explicitly supported photo categories.

------------------------------------------------------------------------

## Check-out Workflow

Show:

-   expected departure time;
-   actual departure confirmation;
-   room inspection status;
-   deposit return status;
-   damage or missing-item report;
-   housekeeping task creation.

Recommended actions:

-   confirm guest departed;
-   inspect room;
-   report damage;
-   resolve deposit;
-   mark room Vacant Dirty;
-   send room to housekeeping queue.

------------------------------------------------------------------------

# Module 5

## Guest and Booking View

### Purpose

Provide an operational view of the booking without reproducing a full
PMS.

### Booking Detail

Show:

-   guest name;
-   stay dates;
-   room;
-   number of guests;
-   booking status;
-   source;
-   contact information when available;
-   arrival notes;
-   transport notes;
-   operational notes;
-   current check-in/check-out state.

------------------------------------------------------------------------

### Deliberate Exclusions

Vanara Central should not initially become a replacement for Beds24.

Do not duplicate advanced PMS functions such as:

-   complete rate-plan management;
-   channel configuration;
-   invoice accounting;
-   detailed payment reconciliation;
-   complex booking modification;
-   full guest CRM history.

When required, authorized users can be directed to Beds24.

------------------------------------------------------------------------

# Module 6

## Maintenance

### Purpose

Allow staff to report, track and resolve operational problems.

------------------------------------------------------------------------

### Incident Creation

A maintenance incident should include:

-   room or resort area;
-   category;
-   short description;
-   urgency;
-   reporter;
-   optional photo;
-   current status;
-   assigned person.

Photos are allowed for damage, faults and operational problems.

------------------------------------------------------------------------

### Categories

Initial categories may include:

-   air conditioning;
-   electricity;
-   plumbing;
-   furniture;
-   lock or door;
-   bathroom;
-   structural;
-   garden;
-   pool or pond;
-   appliance;
-   internet;
-   other.

------------------------------------------------------------------------

### Statuses

Recommended states:

-   Reported
-   Assigned
-   In Progress
-   Waiting for Parts
-   Waiting for External Technician
-   Resolved
-   Verified
-   Closed

------------------------------------------------------------------------

### Escalation Pattern

The required escalation model is:

1.  report or call the internal maintenance person;
2.  allow internal resolution;
3.  if unresolved, expose or activate the appropriate external
    technician contact;
4.  track the escalation;
5.  verify resolution.

The first escalation target is the internal handyman.

External contacts should be categorized by problem type.

Examples:

-   electrician;
-   air-conditioning technician;
-   plumber;
-   internet provider;
-   construction worker;
-   appliance repair.

------------------------------------------------------------------------

### Escalation UI

The incident screen should show:

-   internal assignee;
-   time since reported;
-   latest update;
-   escalation eligibility;
-   recommended external contact;
-   call or message action;
-   escalation history limited to essential events.

Avoid building a complex service-desk platform.

------------------------------------------------------------------------

### Maintenance Block

An incident can block a room.

When a room is blocked:

-   it must be visible in Rooms and Today;
-   housekeeping cannot mark it Ready unless the blocking issue is
    resolved or explicitly overridden by an authorized role;
-   Owner and Manager must see the reason.

------------------------------------------------------------------------

# Module 7

## Damage and Problem Reports

### Purpose

Provide a fast cross-module way to report damage or operational
problems.

### Entry Points

A report can be created from:

-   room detail;
-   housekeeping checklist;
-   check-out inspection;
-   maintenance;
-   Today screen.

------------------------------------------------------------------------

### Required Information

-   location;
-   category;
-   description;
-   urgency;
-   optional photo;
-   blocking or non-blocking;
-   reporter.

The system should route the report to Maintenance automatically.

------------------------------------------------------------------------

# Module 8

## Ask Waraporn

### Purpose

Allow staff to ask operational questions in natural language.

This module is particularly important when staff need immediate help
during guest interactions.

------------------------------------------------------------------------

### Example Use Case

Walk-in guests ask:

-   whether a room is available;
-   which room is available;
-   the price;
-   whether a specific room type can be offered;
-   whether an arrival can be accepted tonight.

Staff open Ask Waraporn and ask the question in Thai or another
supported language.

Waraporn responds using current backend data.

------------------------------------------------------------------------

### Data Sources

Waraporn may use:

-   current availability;
-   current offers and prices;
-   room readiness;
-   operational restrictions;
-   approved knowledge base information.

Waraporn must not call Beds24 directly.

------------------------------------------------------------------------

### Answer Requirements

Answers should be:

-   clear;
-   concise;
-   operational;
-   based on current data;
-   explicit about uncertainty;
-   safe for staff to repeat to the guest.

Example answer structure:

-   availability result;
-   room name or type;
-   price;
-   relevant condition;
-   recommended next action.

------------------------------------------------------------------------

### AI Guardrails

Waraporn must not:

-   invent availability;
-   invent prices;
-   override business rules;
-   confirm a booking without an authorized backend workflow;
-   expose internal provider data;
-   access unrestricted personal information.

AI should be invoked selectively to control OpenAI costs.

Deterministic queries should be solved by backend logic first.

------------------------------------------------------------------------

### Suggested Quick Actions

-   Availability tonight
-   Price for walk-in
-   Tomorrow's arrivals
-   Which rooms are ready?
-   Which rooms need cleaning?
-   Open maintenance issues
-   What should we prioritize?

------------------------------------------------------------------------

# Module 9

## Owner Dashboard

### Purpose

Provide Stefano and JF with a high-level operational overview.

This is a priority module.

------------------------------------------------------------------------

### Dashboard Sections

#### Today at Vanara

Show:

-   arrivals;
-   departures;
-   occupied rooms;
-   available rooms;
-   rooms ready;
-   rooms not ready;
-   blocked rooms.

------------------------------------------------------------------------

#### Operational Alerts

Show only important exceptions:

-   arrival room not ready;
-   unresolved critical maintenance;
-   sync failure;
-   booking without mapped unit;
-   overdue housekeeping;
-   unresolved check-out issue;
-   passport or deposit issue, when relevant.

------------------------------------------------------------------------

#### Housekeeping Summary

Show:

-   to clean;
-   in progress;
-   ready for inspection;
-   ready;
-   blocked.

------------------------------------------------------------------------

#### Maintenance Summary

Show:

-   new incidents;
-   critical incidents;
-   overdue incidents;
-   externally escalated incidents;
-   blocked rooms.

------------------------------------------------------------------------

#### Booking and Occupancy Snapshot

Show:

-   arrivals next 7 days;
-   departures next 7 days;
-   occupied units;
-   near-term availability;
-   relevant operational gaps.

This is not intended to replace financial or revenue-management
dashboards in Beds24.

------------------------------------------------------------------------

#### Staff Activity

Only essential operational activity should be shown.

Examples:

-   room marked Ready;
-   issue reported;
-   maintenance resolved;
-   check-in completed;
-   check-out completed.

Avoid a complete surveillance-style staff timeline.

------------------------------------------------------------------------

### Dashboard Design

Owner Dashboard may use:

-   summary cards;
-   status counts;
-   exception lists;
-   simple trend charts when useful.

Every dashboard item should lead to an actionable detail screen.

------------------------------------------------------------------------

# Module 10

## Notifications and Attention System

### Purpose

Ensure important operational events reach the correct people.

### Notification Types

Examples:

-   arrival room not ready;
-   urgent maintenance issue;
-   room blocked;
-   checkout completed;
-   housekeeping task ready for inspection;
-   unresolved issue escalated;
-   synchronization failure.

------------------------------------------------------------------------

### Delivery

Initial delivery may occur through:

-   in-app notification;
-   LINE message;
-   owner dashboard alert.

Avoid excessive notifications.

Only actionable or important events should trigger an alert.

------------------------------------------------------------------------

### Read and Resolution

Notifications should distinguish:

-   unread;
-   acknowledged;
-   resolved.

Keep the model lightweight.

------------------------------------------------------------------------

# Module 11

## Operational Notes and Daily Instructions

### Purpose

Allow Owner or Manager to communicate short operational instructions.

Examples:

-   prioritize Bungalow 5 and 6 after checkout;
-   prepare Villa 10 first;
-   inspect blankets;
-   turn on air conditioning;
-   check garden path;
-   repair fence.

------------------------------------------------------------------------

### Rules

-   notes should be short;
-   can be attached to a room, task or day;
-   can have a priority;
-   can be marked completed;
-   should not become a chat platform.

------------------------------------------------------------------------

# Module 12

## Settings and Configuration

### Purpose

Allow authorized users to manage limited operational configuration.

### Initial Settings

-   room-ready checklist;
-   maintenance categories;
-   external technician contacts;
-   role permissions;
-   notification preferences;
-   passport retention policy;
-   status labels where safe;
-   staff assignments.

Avoid exposing technical backend configuration to normal users.

------------------------------------------------------------------------

# Shared UI Components

The following components should be reused across modules:

-   Room Status Badge
-   Priority Badge
-   Guest Summary Card
-   Booking Summary Card
-   Task Card
-   Checklist
-   Maintenance Alert
-   Photo Attachment
-   Staff Assignment
-   Notes Field
-   Confirm Action Dialog
-   Retry Network Action

Consistency is more important than visual novelty.

------------------------------------------------------------------------

# Status and Colour Guidance

Use consistent colours throughout the application.

Suggested semantic mapping:

-   Ready / Resolved → positive
-   In Progress / Occupied → neutral or active
-   Attention / Inspection → warning
-   Urgent / Blocked / Critical → danger
-   Unavailable / Disabled → muted

Do not rely on colour alone.

Every status must also have a text label or icon.

------------------------------------------------------------------------

# Language and Localization

The UI should support at least:

-   Thai
-   English

Italian may be useful for Owner views.

Operational room names must remain unchanged.

Translations should use natural staff language rather than literal
technical terms.

------------------------------------------------------------------------

# Photos

Photos are intentionally limited to:

-   passport capture;
-   damage;
-   maintenance problems;
-   operational evidence when necessary.

The application is not a general media repository.

Every photo should be attached to a clear operational record.

------------------------------------------------------------------------

# Data Refresh

Operational screens should display recent data from D1.

Recommended behaviour:

-   refresh when entering a screen;
-   allow manual refresh;
-   use lightweight polling only where useful;
-   show last updated time;
-   show synchronization warnings clearly.

Do not make the UI depend on direct live calls to Beds24.

------------------------------------------------------------------------

# Empty and Error States

Every module must define:

-   empty state;
-   loading state;
-   retry state;
-   permission denied state;
-   backend unavailable state.

Messages should be clear and operational.

Example:

"Unable to save the room status. Check your connection and try again."

Avoid technical error messages for staff.

------------------------------------------------------------------------

# Audit and Minimal Logging

The UI should create only the operational log entries needed for
accountability.

Examples:

-   who marked a room Ready;
-   who reported an issue;
-   who resolved maintenance;
-   who completed check-in;
-   who escalated an incident.

Do not build a complete historical timeline by default.

------------------------------------------------------------------------

# Explicit Non-Goals

The initial UI must not include:

-   multi-resort management;
-   offline mode;
-   full PMS replacement;
-   advanced accounting;
-   employee payroll;
-   shift scheduling;
-   full CRM;
-   general team chat;
-   complex project management;
-   unrestricted photo storage;
-   complete historical event timelines;
-   AI in every workflow.

These may be reconsidered only if a real operational need appears.

------------------------------------------------------------------------

# Recommended Development Order

## Phase 1 - Operational Core

1.  Authentication and role-based navigation
2.  Today screen
3.  Rooms overview
4.  Room detail
5.  Housekeeping queue
6.  Ready checklist
7.  Maintenance reporting
8.  Owner Dashboard minimum version

------------------------------------------------------------------------

## Phase 2 - Guest Operations

1.  Check-in workflow
2.  Passport capture
3.  Check-out workflow
4.  Damage reports
5.  Deposit and arrival notes
6.  Notifications

------------------------------------------------------------------------

## Phase 3 - Intelligence and Optimization

1.  Ask Waraporn
2.  Walk-in availability and price assistant
3.  Owner operational insights
4.  Selective AI summaries
5.  Improved escalation suggestions

------------------------------------------------------------------------

# Acceptance Principles

A module is ready only when:

-   it uses Vanara room names;
-   it works well on mobile;
-   it respects role permissions;
-   it reads and writes through backend APIs;
-   it handles network errors;
-   it does not duplicate business logic;
-   it has clear empty and loading states;
-   staff can understand it without technical training.

------------------------------------------------------------------------

# Frozen Decisions

-   Vanara Central is single-resort.
-   Owner Dashboard is a priority.
-   The primary staff experience is mobile-first.
-   No offline mode is required.
-   Current state is more important than full history.
-   Photos are limited to passports and operational problems.
-   Room Ready includes a simple configurable checklist.
-   Maintenance follows internal-first escalation.
-   Ask Waraporn uses current backend availability and pricing.
-   AI is selective and cost-aware.
-   Beds24 is never called directly by the UI.
-   The product must use Vanara business language.

------------------------------------------------------------------------

# Status

**FROZEN BASELINE**
