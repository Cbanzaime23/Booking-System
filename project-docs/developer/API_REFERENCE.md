# CCF Manila Room Reservation System — API Reference

> **Version:** 2.0 · **Transport:** JSONP over HTTP GET · **Auth:** Admin PIN in payload  
> **Base URL:** Google Apps Script Web App deployment URL (configured in `config.js`)

---

## Overview

All API calls are made to a single Google Apps Script Web App endpoint via **JSONP**. The frontend injects a `<script>` tag pointing to the Apps Script URL with query parameters. The backend wraps its JSON response in a callback function.

### Request Format

```
GET {APPS_SCRIPT_URL}?callback={callbackName}&action={action}&payload={encodedJSON}
```

| Parameter    | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `callback`  | string | Yes      | JSONP callback function name |
| `action`    | string | Yes      | API action identifier (see table below) |
| `payload`   | string | Varies   | URL-encoded JSON object (not required for `fetch_all`) |

### Response Format

All responses are wrapped in JSONP:
```javascript
callbackName({"success": true, "message": "...", ...})
```

### Authentication

Operations requiring admin privileges accept an `adminPin` (or `admin_pin`) field in the payload. The PIN is validated server-side against the `ADMIN_PIN` constant in `Config.gs`.

---

## Endpoints

### 1. `fetch_all` — Fetch All Bookings

Retrieves all confirmed bookings, blocked dates, global settings (announcements), reservation window state, and validation sheet info. This is the primary data-loading call made on page load.

**Auth:** None  
**Payload:** None (no `payload` parameter needed)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-...",
      "date": "2026-04-28",
      "start_iso": "2026-04-28T10:00:00Z",
      "end_iso": "2026-04-28T11:30:00Z",
      "first_name": "Juan",
      "last_name": "Dela Cruz",
      "event": "DGroup Meeting",
      "room": "Main Hall",
      "participants": 10,
      "status": "confirmed",
      "recurrence_id": null,
      "leader_first_name": "Pedro",
      "table_id": "T3",
      "is_admin_booking": false
    }
  ],
  "blocked_dates": [
    {
      "date": "2026-05-01",
      "room": "All Rooms",
      "reason": "Holiday - Labor Day",
      "start_time": "",
      "end_time": ""
    }
  ],
  "announcement": {
    "message": "System maintenance on May 5.",
    "isActive": true,
    "startDate": "2026-05-01",
    "endDate": "2026-05-05"
  },
  "reservation_window": {
    "openDay": 0,
    "openTime": "08:00",
    "closeDay": 1,
    "closeTime": "20:00",
    "isOpen": true
  },
  "latest_validation_sheet": {
    "name": "April",
    "url": "https://docs.google.com/spreadsheets/d/.../edit#gid=..."
  }
}
```

---

### 2. `create` — Create Booking

Creates a new single or recurrent booking with full validation pipeline.

**Auth:** Optional (`adminPin` for admin features)  
**Concurrency:** Uses `LockService.getScriptLock()` with 30s timeout

**Payload:**
```json
{
  "first_name": "Juan",
  "last_name": "Dela Cruz",
  "email": "juan@example.com",
  "event": "DGroup Meeting",
  "room": "Main Hall",
  "participants": 10,
  "start_iso": "2026-04-28T10:00:00+08:00",
  "end_iso": "2026-04-28T11:30:00+08:00",
  "notes": "Optional notes",
  "terms_accepted": true,
  "privacy_accepted": true,
  "consent_timestamp": "2026-04-26T18:30:00+08:00",
  "table_id": "T3",
  "original_room": "Jonah",
  "app_url": "https://cbanzaime23.github.io/Booking-System/index.html",
  "adminPin": "",
  "recurrence": "none"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `first_name` | string | Yes | Reserver's first name |
| `last_name` | string | Yes | Reserver's last name |
| `email` | string | Yes | Reserver's email |
| `event` | string | Yes | Event type (e.g., "DGroup Meeting", "Sunday Service") |
| `room` | string | Yes | Room name (must match `ROOM_CONFIG` key) |
| `participants` | number | Yes | Group size |
| `start_iso` | string | Yes | ISO 8601 start datetime |
| `end_iso` | string | Yes | ISO 8601 end datetime |
| `notes` | string | No | Optional booking notes |
| `terms_accepted` | boolean | Yes | Housekeeping rules acceptance |
| `privacy_accepted` | boolean | Yes | Privacy policy acceptance |
| `consent_timestamp` | string | No | ISO timestamp of consent |
| `table_id` | string | No | Main Hall table selection (e.g., "T1"–"T6") |
| `original_room` | string | No | Original room before auto-upgrade |
| `app_url` | string | No | Public app URL for email deep-links |
| `adminPin` | string | No | Admin PIN for privileged booking |
| `recurrence` | string | No | `none`, `weekly`, `monthly`, `quarterly`, `first_wednesday`, `last_saturday` |

**Validation Pipeline (in order):**
1. Admin PIN verification (if provided)
2. Reservation window check (non-admin only)
3. Blocked date check
4. Room configuration validation
5. Input validation (required fields, group size, email, date range)
6. DLeaders name validation with fuzzy matching (non-admin only)
7. Duplicate booking detection (same email + same start + same room)
8. Race condition guard (double-read of fresh bookings)
9. Capacity and concurrent group limits

**Success Response:**
```json
{
  "success": true,
  "message": "Booking confirmed!",
  "id": "550e8400-e29b-41d4-...",
  "bookedRoom": "Main Hall",
  "table_id": "T3",
  "requestedRoom": "Jonah",
  "start_iso": "2026-04-28T10:00:00+08:00",
  "end_iso": "2026-04-28T11:30:00+08:00"
}
```

**Recurrence Response:**
```json
{
  "success": true,
  "message": "Recurrent: 10 booked, 2 failed.",
  "id": "first-booking-uuid",
  "bookedRoom": "Main Hall",
  "table_id": "T3",
  "requestedRoom": "Main Hall"
}
```

---

### 3. `cancel` — Cancel Booking

Cancels a single booking or an entire recurrent series.

**Auth:** Booking Code (user) OR Admin PIN  
**Concurrency:** Uses `LockService.getScriptLock()` with 30s timeout

**Payload:**
```json
{
  "bookingId": "550e8400-e29b-41d4-...",
  "bookingCode": "550E8400",
  "adminPin": "",
  "cancelSeries": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bookingId` | string | Yes | Full booking UUID |
| `bookingCode` | string | Conditional | First 8+ chars of booking ID (user verification) |
| `adminPin` | string | Conditional | Admin PIN (overrides booking code) |
| `cancelSeries` | boolean | No | If `true` and admin, cancels all bookings with the same `recurrence_id` |

**Authorization Logic:**
- **Admin bookings** (`is_admin_booking = TRUE`): Require admin PIN only.
- **User bookings**: Require either a valid booking code OR admin PIN.

**Success Response:**
```json
{ "success": true, "message": "Booking cancelled." }
```

**Series Response:**
```json
{ "success": true, "message": "Series cancelled (5 bookings)." }
```

---

### 4. `move` — Move/Reschedule Booking

Moves a booking to a new date, time, and/or room. Admin-only.

**Auth:** Admin PIN required

**Payload:**
```json
{
  "bookingId": "550e8400-e29b-41d4-...",
  "newRoom": "Jonah",
  "start_iso": "2026-05-01T14:00:00+08:00",
  "end_iso": "2026-05-01T15:30:00+08:00",
  "table_id": "",
  "reason": "Room conflict with Sunday Service",
  "adminPin": "CCFManila@2025"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bookingId` | string | Yes | Booking UUID to move |
| `newRoom` | string | Yes | Target room |
| `start_iso` | string | Yes | New start datetime |
| `end_iso` | string | Yes | New end datetime |
| `table_id` | string | No | New table assignment (Main Hall only) |
| `reason` | string | Yes | Reason for move (appended to notes) |
| `adminPin` | string | Yes | Admin PIN |

**Side Effects:** Sends a move notification email to the booking holder.

**Success Response:**
```json
{ "success": true, "message": "Reservation moved successfully." }
```

---

### 5. `block_date` — Block Date(s)

Blocks one or more rooms for a specific date, with optional time range. Auto-cancels conflicting bookings and sends notification emails.

**Auth:** Admin PIN required

**Payload:**
```json
{
  "date": "2026-05-01",
  "rooms": ["Main Hall", "Jonah"],
  "reason": "Holiday - Labor Day",
  "start_time": "10:00",
  "end_time": "16:00",
  "adminPin": "CCFManila@2025"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | string | Yes | Date to block (`yyyy-MM-dd`) |
| `rooms` | string[] | No | Array of room names (defaults to `["All Rooms"]`) |
| `room` | string | No | Single room (backward compatibility) |
| `reason` | string | Yes | Reason for blocking |
| `start_time` | string | No | Start time (`HH:mm`). Omit for full-day block |
| `end_time` | string | No | End time (`HH:mm`). Omit for full-day block |
| `adminPin` | string | Yes | Admin PIN |

**Success Response:**
```json
{
  "success": true,
  "message": "Date blocked successfully. 3 existing booking(s) were automatically cancelled and affected users have been notified via email.",
  "cancelledCount": 3,
  "cancelledEvents": ["DGroup Meeting", "Bible Study", "Worship Practice"]
}
```

---

### 6. `delete_block_date` — Remove Blocked Date

Removes a previously blocked date entry.

**Auth:** Admin PIN required

**Payload:**
```json
{
  "date": "2026-05-01",
  "room": "Main Hall",
  "reason": "Holiday - Labor Day",
  "start_time": "10:00",
  "end_time": "16:00",
  "adminPin": "CCFManila@2025"
}
```

All fields except `adminPin` are used for exact matching against the BlockedDates sheet.

**Success Response:**
```json
{ "success": true, "message": "Blocked date removed successfully." }
```

---

### 7. `update_reservation_window` — Update Reservation Window

Sets the weekly reservation window schedule.

**Auth:** Admin PIN required (field name: `admin_pin`)

**Payload:**
```json
{
  "openDay": 0,
  "openTime": "08:00",
  "closeDay": 1,
  "closeTime": "20:00",
  "admin_pin": "CCFManila@2025"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `openDay` | number | Yes | Day window opens (0=Sun, 1=Mon, ..., 6=Sat) |
| `openTime` | string | Yes | Time window opens (`HH:mm`) |
| `closeDay` | number | Yes | Day window closes |
| `closeTime` | string | Yes | Time window closes (`HH:mm`) |
| `admin_pin` | string | Yes | Admin PIN |

---

### 8. `verify_admin` — Verify Admin PIN

Validates an admin PIN. Used by the Role Selection Modal on the booking page.

**Auth:** None (this is the auth check itself)

**Payload:**
```json
{ "admin_pin": "CCFManila@2025" }
```

**Success Response:**
```json
{ "success": true, "message": "Admin verified." }
```

---

### 9. `fetch_user_bookings` — Fetch User's Bookings

Retrieves future confirmed bookings for a specific user by email. Returns sanitized data (no full IDs exposed).

**Auth:** None (email-based lookup)

**Payload:**
```json
{ "email": "juan@example.com" }
```

**Response:**
```json
{
  "success": true,
  "bookings": [
    {
      "id": "550e8400-e29b-41d4-...",
      "date": "Apr 28, 2026",
      "start_time": "10:00 AM",
      "end_time": "11:30 AM",
      "event": "DGroup Meeting",
      "room": "Main Hall"
    }
  ]
}
```

---

### 10. `export_user_data` — GDPR Data Export

Exports all booking data for a user after identity verification via booking code.

**Auth:** Email + Booking Code (first 12 chars of any booking ID, case-insensitive)

**Payload:**
```json
{
  "email": "juan@example.com",
  "bookingCode": "550E8400E29B"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": "...", "date": "...", "first_name": "Juan", ... }
  ]
}
```

**Side Effects:** Sends a GDPR export confirmation email.

---

### 11. `delete_user_data` — GDPR Data Deletion

Anonymizes all personal data for a user (Right to Erasure). Future confirmed bookings are cancelled.

**Auth:** Email + Booking Code

**Payload:**
```json
{
  "email": "juan@example.com",
  "bookingCode": "550E8400E29B"
}
```

**Anonymization Actions:**
| Field | Replacement |
|-------|-------------|
| `first_name` | `Anonymized` |
| `last_name` | `User` |
| `email` | `redacted@anonymized.local` |
| `leader_first_name` | *(empty)* |
| `leader_last_name` | *(empty)* |
| `notes` | *(empty)* |
| Future `status` | `cancelled_gdpr` |

**Side Effects:** Sends a GDPR deletion confirmation email.

**Response:**
```json
{ "success": true, "count": 5, "message": "Successfully anonymized 5 booking(s)." }
```

---

### 12. `update_announcement` — Update Announcement

Updates the global announcement banner settings.

**Auth:** Admin PIN required (field name: `pin`)

**Payload:**
```json
{
  "message": "System maintenance on May 5.",
  "isActive": true,
  "startDate": "2026-05-01",
  "endDate": "2026-05-05",
  "pin": "CCFManila@2025"
}
```

---

### 13. `extract_logs` — Extract System Logs

Returns the raw Logs sheet data for admin review.

**Auth:** None (the frontend gates access via admin state)

**Payload:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "data": [
    ["Timestamp", "Action", "Booking ID", "Admin PIN", "Details"],
    ["2026-04-26 10:00:00", "Create", "550e8400-...", "N/A", "{...}"]
  ]
}
```

---

## Error Responses

All errors follow the same shape:
```json
{ "success": false, "message": "Descriptive error message." }
```

### Common Errors

| Error | Cause |
|-------|-------|
| `"Invalid Admin PIN."` | Wrong or missing admin PIN |
| `"Reservation window is currently closed."` | Non-admin booking outside the configured window |
| `"The room {room} is closed on this date: {reason}"` | Booking on a blocked date |
| `"Sorry, this slot was just filled by another user."` | Race condition / capacity exceeded |
| `"You already have a booking for this time slot."` | Duplicate detection |
| `"Your reservation was denied..."` | DLeaders name validation failure |
| `"Missing required field: {field}."` | Payload validation failure |
| `"Booking not found."` | Invalid booking ID |
| `"Already cancelled."` | Attempting to cancel an already-cancelled booking |

---

## Google Sheets Schema

### Bookings Sheet

| Column | Type | Description |
|--------|------|-------------|
| `id` | string | UUID v4 |
| `date` | string | `yyyy-MM-dd` |
| `start_iso` | string | ISO datetime with trailing `Z` (actually Manila local) |
| `end_iso` | string | ISO datetime with trailing `Z` (actually Manila local) |
| `first_name` | string | Reserver's first name |
| `last_name` | string | Reserver's last name |
| `email` | string | Reserver's email |
| `leader_first_name` | string | *(Deprecated — kept for backward compat)* |
| `leader_last_name` | string | *(Deprecated — kept for backward compat)* |
| `event` | string | Event type |
| `room` | string | Room name |
| `participants` | number | Group size |
| `status` | string | `confirmed`, `cancelled`, `cancelled_gdpr` |
| `created_at` | datetime | Row creation timestamp |
| `notes` | string | Booking notes + admin annotations |
| `terms_accepted` | boolean | `TRUE`/`FALSE` |
| `privacy_accepted` | boolean | `TRUE`/`FALSE` |
| `consent_timestamp` | string | ISO timestamp of consent |
| `recurrence_id` | string | UUID linking recurrent bookings |
| `table_id` | string | Main Hall table (e.g., `T1`–`T6`) |
| `is_admin_booking` | boolean | `TRUE` if created by admin |

### BlockedDates Sheet

| Column | Type | Description |
|--------|------|-------------|
| `Date` | string | `yyyy-MM-dd` |
| `Room` | string | Room name or `"All Rooms"` |
| `Reason` | string | Block reason |
| `Start Time` | string | `HH:mm` (optional, empty = full day) |
| `End Time` | string | `HH:mm` (optional, empty = full day) |

### Settings Sheet

Key-value pairs stored as rows:

| Key | Value Type | Description |
|-----|-----------|-------------|
| `Announcement Message` | string | Banner text |
| `Announcement Active` | `TRUE`/`FALSE` | Toggle |
| `Announcement Start` | date | Start date |
| `Announcement End` | date | End date |
| `Reservation Window Open Day` | number | 0–6 |
| `Reservation Window Open Time` | string | `HH:mm` |
| `Reservation Window Close Day` | number | 0–6 |
| `Reservation Window Close Time` | string | `HH:mm` |

### Logs Sheet

| Column | Type | Description |
|--------|------|-------------|
| `Timestamp` | datetime | When the action occurred |
| `Action` | string | Action type (e.g., `Create`, `Cancel`, `Move`, `GDPR_EXPORT`) |
| `Booking ID` | string | Related booking UUID |
| `Admin PIN` | string | PIN used or `N/A` |
| `Details` | string | JSON-encoded action details |
