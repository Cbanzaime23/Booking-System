# CCF Manila Room Reservation System — Process Flow Table

> **Version:** 2.0  
> Step-by-step tabular breakdown of every system interaction across all workflows.

---

## Table of Contents
- [Main Booking Flow](#main-booking-flow)
- [Cancellation Flow](#cancellation-flow)
- [Email Deep-Link Cancellation Flow](#email-deep-link-cancellation-flow)
- [Move/Reschedule Flow](#movereschedule-flow)
- [Block Date Flow](#block-date-flow)
- [GDPR Flow](#gdpr-flow)
- [Announcement Management Flow](#announcement-management-flow)
- [Reservation Window Flow](#reservation-window-flow)

---

## Main Booking Flow

| Step | Actor | Action | Feature / Decision |
|:-----|:------|:-------|:-------------------|
| **Start** | User / Admin | Decides to book a room. | |
| 1 | User / Admin | Opens the reservation app URL. | |
| 2 | Frontend | Loads `index.html`, imports ES6 modules, loads HTML components via `componentLoader.js`. Checks URL parameters for cancellation deep-links. | **Feature:** Component-Based Architecture, Email Deep-Link Detection |
| 3 | Frontend | Shows **Role Selection Modal**. User clicks "Continue as User" or "Continue as Admin" (enters PIN). | **Feature:** Role-Based Authorization via Modal |
| 4 | Frontend | Calls Apps Script `action=fetch_all` via JSONP. Returns bookings, blocked dates, announcement, reservation window, and validation sheet info. | **Feature:** Unified Data Fetch |
| 5 | Frontend | Checks reservation window status. If closed for non-admin, shows **Reservation Window Banner** and blocks booking. | **Feature:** Reservation Window Enforcement |
| 6 | Frontend | Renders the weekly calendar for the selected room, calculating capacity colors per slot. Shows **Announcement Banner** if active and within date range. | **Feature:** Dynamic Capacity Calendar, Global Announcements |
| 7 | User / Admin | Navigates weeks and clicks on a desired time slot. | |
| 8 | Frontend | `handleSlotClick` triggered. | **Decision:** Is slot Available? · **YES:** → Step 10 · **NO (Partial/Full):** → Step 9 |
| 9 | Frontend | Displays **"What would you like to do?"** choice modal with options: Book New, Cancel, Move (admin only). | **Feature:** Action Choice Modal |
| 10 | Frontend | Opens `openTimeSelectionModal`. User selects **End Time** from strict 30-min dropdowns. Displays **Duration** (hrs). | **Feature:** 30-Min Time Strict Increment Selection |
| 11 | Frontend | Calls `openBookingModalForSelectedSlot`. Modal opens. Form adapts based on `state.isAdmin`. | **Feature:** Role-Based Form Rendering |
| 12 | Frontend | Checks `ROOM_CONFIG` capacity and slot availability. | **Feature:** Capacity Validation |
| 13 | User / Admin | Fills out the booking form and checks Terms/Privacy flags. Admins see recurrence options. | |
| 14 | Frontend | `handleBookingFormSubmit` runs client-side validation. | **Decision:** Passed? · **NO:** Show Toast · **YES:** → Step 15 |
| 15 | Frontend | Triggers `checkMainHallAvailability` (Squeeze Logic). | **Decision:** Room open & User eligible? · **YES:** → Step 16 · **NO:** → Step 17 |
| 16 | Frontend | Opens **Interactive Table Selection Floorplan**. User picks table (T1–T6). | **Feature:** Squeeze Logic, Interactive Floorplan |
| 17 | Frontend | Populates and shows **Confirm Summary Modal**. Warns if auto-upgraded. | **Feature:** Booking Summary |
| 18 | User / Admin | Reviews summary and clicks "Yes, Confirm". | |
| 19 | Frontend | Calls `proceedWithBooking`. Shows **Loading Modal**. Sends JSONP `action=create` to Apps Script. | |
| 20 | Backend | `doGet` routes to `handleCreateBooking`. Acquires script lock (30s). | **Feature:** Race Condition Guard |
| 21 | Backend | Checks reservation window (non-admin), blocked dates, room config, input validation. | **Feature:** Server-Side Validation |
| 22 | Backend | Runs **DLeaders Name Validation** with 95% fuzzy match (non-admin only). | **Decision:** Valid? · **NO:** Send denied email to leader → Step 27 · **YES:** → Step 23 |
| 23 | Backend | Duplicate detection (same email + start + room). Race condition guard (double-read of fresh bookings). Checks capacity and concurrent groups. | **Feature:** Optimistic Locking, Duplicate Prevention |
| 24 | Backend | Checks Recurrence. | **Decision:** Recurrent? · **YES:** `handleRecurrentBooking` → loop Steps 23–25 per iteration · **NO:** → Step 25 |
| 25 | Google Sheets | `appendBookingRow` writes 21-column row to "Bookings" sheet. | |
| 26 | Backend | `sendConfirmationEmail` builds branded HTML body with cancellation deep-link, calendar link, and survey link. | **Feature:** Rich HTML Email |
| 27 | Google MailApp | Sends email via `MailApp.sendEmail`. | |
| 28 | Backend | Returns JSONP response with booking ID, booked room, table ID. Releases lock. | |
| 29 | Frontend | Receives response. Closes loader. | **Decision:** Success? · **NO:** Show Alert/Toast · **YES:** → Step 30 |
| 30 | Frontend | Shows **Success Modal** with Booking Code and room assignment. | |

---

## Cancellation Flow

| Step | Actor | Action | Feature / Decision |
|:-----|:------|:-------|:-------------------|
| C1 | User / Admin | Clicks on a booked time slot → selects "Cancel a Booking". | |
| C2 | Frontend | Shows list of bookings in that slot. User selects one. | |
| C3 | User / Admin | Enters **Booking Code** (user) or **Admin PIN** (admin). | |
| C4 | Frontend | Sends JSONP `action=cancel` with `bookingId`, `bookingCode`/`adminPin`. | |
| C5 | Backend | Validates identity. Checks if booking is admin-created (requires PIN). | **Decision:** Admin booking? · **YES:** Require admin PIN · **NO:** Accept booking code OR admin PIN |
| C6 | Backend | Checks for series cancellation (admin + `cancelSeries` flag). | **Decision:** Cancel series? · **YES:** Cancel all with same `recurrence_id` · **NO:** Cancel single |
| C7 | Google Sheets | Updates status to `cancelled`. Appends `[Admin Cancel]` note if admin. | |
| C8 | Backend | Logs activity. Returns success response. | |

---

## Email Deep-Link Cancellation Flow

| Step | Actor | Action | Feature / Decision |
|:-----|:------|:-------|:-------------------|
| E1 | User | Clicks "Cancel This Booking" link in confirmation email. | **Feature:** Email Deep-Link |
| E2 | Frontend | App loads with `?cancel_id={id}&cancel_code={code}` in URL. | |
| E3 | Frontend | `handleEmailCancelDeepLink` detects URL params. Opens **Email Cancel Modal** with booking details pre-filled. | **Feature:** One-Click Cancellation |
| E4 | User | Clicks "Yes, Cancel" to confirm. | |
| E5 | Frontend | Sends JSONP `action=cancel` with `bookingId` and `bookingCode`. | |
| E6 | Backend | Processes cancellation (same as C5–C8 above). | |

---

## Move/Reschedule Flow

| Step | Actor | Action | Feature / Decision |
|:-----|:------|:-------|:-------------------|
| M1 | Admin | Clicks booked slot → selects "Move / Reschedule". | **Admin only** |
| M2 | Frontend | Opens **Move Modal**. Shows current booking details. | |
| M3 | Admin | Selects new **Date**, **Start Time**, **End Time**, **Room**. | |
| M4 | Frontend | Runs conflict check against existing bookings. | **Decision:** Conflict? · **NO:** → M6 · **YES:** → M5 |
| M5 | Frontend | Shows **Conflict Warning Modal** with overlapping booking details. | **Decision:** Proceed? · **YES:** → M6 · **NO:** → End |
| M6 | Frontend | Shows **Move Summary Modal** with before/after comparison. | |
| M7 | Admin | Enters **Reason** for move and clicks "Confirm Move". | |
| M8 | Frontend | Sends JSONP `action=move` with booking ID, new schedule, reason, admin PIN. | |
| M9 | Backend | Validates admin PIN. Updates date, start_iso, end_iso, room, table_id in Sheets. Appends `[Admin Moved: reason]` to notes. | |
| M10 | Backend | `sendMoveNotificationEmail` notifies the original booker. | |
| M11 | Backend | Logs activity. Returns success response. | |

---

## Block Date Flow

| Step | Actor | Action | Feature / Decision |
|:-----|:------|:-------|:-------------------|
| B1 | Admin | Opens Admin Dashboard → Blocked Dates section. | |
| B2 | Admin | Selects date, rooms (multi-select), optional time range, and reason. | **Feature:** Multi-Room, Partial-Day Blocking |
| B3 | Frontend | Sends JSONP `action=block_date` with payload. | |
| B4 | Backend | Validates admin PIN. Creates/migrates BlockedDates sheet. | |
| B5 | Backend | Writes one row per room to BlockedDates sheet. | |
| B6 | Backend | Scans all confirmed bookings matching the blocked date. | |
| B7 | Backend | For each matching booking: checks room match and time overlap. | **Decision:** Overlap? · **YES:** Cancel + notify · **NO:** Skip |
| B8 | Google Sheets | Sets `status` to `cancelled`. Appends `[Auto-Cancelled: Blocked Date]` note. | |
| B9 | Backend | `sendBlockedDateCancellationEmail` to each affected user. | |
| B10 | Backend | Returns count of cancelled bookings. | |

### Delete Blocked Date

| Step | Actor | Action |
|:-----|:------|:-------|
| BD1 | Admin | Clicks 🗑 delete button on blocked date entry. |
| BD2 | Frontend | Sends JSONP `action=delete_block_date` with matching criteria. |
| BD3 | Backend | Validates admin PIN. Finds and deletes matching row from BlockedDates sheet. |

---

## GDPR Flow

### Export

| Step | Actor | Action |
|:-----|:------|:-------|
| G1 | User | Opens My Bookings → clicks "Export My Data". |
| G2 | User | Enters email and Booking Code for identity verification. |
| G3 | Frontend | Sends JSONP `action=export_user_data`. |
| G4 | Backend | Verifies booking code matches a booking with that email. |
| G5 | Backend | Collects all bookings for that email. Sends export confirmation email. |
| G6 | Backend | Returns JSON data array to frontend. |

### Delete (Right to Erasure)

| Step | Actor | Action |
|:-----|:------|:-------|
| G7 | User | Opens My Bookings → clicks "Delete My Data". |
| G8 | User | Confirms by entering email and Booking Code. |
| G9 | Frontend | Sends JSONP `action=delete_user_data`. |
| G10 | Backend | Verifies identity. Iterates all rows matching the email. |
| G11 | Backend | Anonymizes personal fields (name → "Anonymized User", email → "redacted@anonymized.local"). Cancels future bookings. Clears notes and leader names. |
| G12 | Backend | Sends deletion confirmation email (to original email, before anonymization). |
| G13 | Backend | Returns count of anonymized records. |

---

## Announcement Management Flow

| Step | Actor | Action |
|:-----|:------|:-------|
| A1 | Admin | Opens Admin Dashboard → Announcement Settings. |
| A2 | Admin | Enters message, toggles active, sets optional start/end dates. |
| A3 | Frontend | Sends JSONP `action=update_announcement`. |
| A4 | Backend | Validates admin PIN. Updates Settings sheet (key-value rows). |
| A5 | Frontend | On next `fetch_all`, the announcement data is returned and the banner displays/hides accordingly. |

---

## Reservation Window Flow

| Step | Actor | Action |
|:-----|:------|:-------|
| R1 | Admin | Opens Admin Dashboard → Reservation Window settings. |
| R2 | Admin | Sets Open Day/Time and Close Day/Time. |
| R3 | Frontend | Sends JSONP `action=update_reservation_window`. |
| R4 | Backend | Validates admin PIN. Saves to Settings sheet. |
| R5 | Frontend | On next `fetch_all`, the window state is checked. If closed, the banner appears and booking is blocked for non-admin users. |
