# Changelog

All notable changes to the CCF Manila Room Reservation System are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.0] — 2026-04-26

### Added
- **Move/Reschedule Bookings** — Admin-only feature to move existing bookings to a new date, time, or room. Includes conflict detection, summary modal, and automated email notification to the affected user.
- **GDPR Compliance Suite** — Full data subject rights implementation:
  - **Export My Data**: Users verify identity via Booking Code, then receive a JSON export and confirmation email of all their bookings.
  - **Delete My Data (Right to Erasure)**: Anonymizes all personal data (name, email, notes) across all bookings for a user. Future confirmed bookings are auto-cancelled with `cancelled_gdpr` status.
  - **Auto-Retention**: Daily trigger (`anonymizeExpiredBookings`) automatically anonymizes bookings older than 5 years (1,825 days).
- **Email Deep-Link Cancellations** — Confirmation emails now embed a unique URL with booking ID and security code. Clicking it bypasses the "My Bookings" flow and opens a one-click cancellation modal directly.
- **Blocked Dates Management** — Admin tool to close rooms for holidays/maintenance:
  - Multi-room selection (checkbox UI for blocking multiple rooms at once).
  - Optional partial-day blocking with Start Time / End Time fields.
  - Auto-cancels all conflicting confirmed bookings and sends email notifications to affected users.
  - Delete blocked dates from the management table.
- **Global Announcements** — Admin-configurable site-wide alert banner:
  - Toggle active/inactive from Admin Dashboard.
  - Date-ranged announcements with Start Date and End Date fields.
  - Auto-hides outside the configured date range.
- **Reservation Window Controls** — Admin-configurable booking window:
  - Set weekly open/close day and time (e.g., "Sunday 08:00 → Monday 20:00").
  - Non-admin users are blocked from booking outside the window.
  - Settings stored in the Settings sheet and surfaced to the frontend.
- **Name Validation (DLeaders List)** — Server-side fuzzy matching (95% Levenshtein threshold) against an external CCF Manila DLeaders spreadsheet. Failed validations trigger a "Denied Booking" email to the user's DGroup Leader.
- **Denied Booking Modal** — Replaced toast notification with a dedicated modal when a booking is denied due to name validation failure.
- **My Bookings Portal** — Email-based lookup for users to view their upcoming confirmed bookings, with options to cancel or exercise GDPR rights.
- **Audit Logging** — All significant actions (Create, Cancel, Move, Block, GDPR operations) are logged to a dedicated `Logs` sheet with timestamps, booking IDs, and JSON details.
- **Admin Dashboard Enhancements**:
  - Weekly Admin Horizon scroller (next 7 days of admin/church events).
  - Search and filter by name, email, or date.
  - D3.js Gantt timeline and Donut charts.
  - DLeaders validation sheet info displayed.
  - Log extraction capability.
- **Component-Based Frontend Architecture** — Modal HTML extracted into `components/modals/` and `components/shared/` directories, loaded dynamically via `componentLoader.js`.
- **Race Condition Guard (Optimistic Locking)** — Double-read pattern with `LockService.getScriptLock()` prevents overbooking when multiple users target the same slot simultaneously.
- **Feedback Survey Integration** — Confirmation emails include a link to a Google Forms feedback survey, pre-filled with the booking code.

### Changed
- **Backend Modularization** — Refactored monolithic `Code.gs` into 9 specialized modules:
  - `Config.js`, `Controllers.js`, `BookingService.js`, `Database.js`, `EmailService.js`, `GdprService.js`, `Retention.js`, `Utils.js`, `Validation.js`
- **Frontend Modularization** — Refactored monolithic `script.js` into ES6 modules:
  - `js/api.js`, `js/calendar.js`, `js/formHandlers.js`, `js/modals.js`, `js/state.js`, `js/admin.js`
  - `js/utils/componentLoader.js`, `js/utils/date.js`, `js/utils/dom.js`, `js/utils/validation.js`
- **Role Selection** — Replaced inline admin checkbox with a global Role Selection Modal at app startup (User vs Admin + PIN entry).
- **Security Hardened** — Removed `SPREADSHEET_ID` and `API_KEY` from frontend `config.js`. All data access now routes exclusively through the Apps Script gateway.
- **HTTPS Enforcement** — Added Content-Security-Policy header and JS redirect for production HTTPS.
- **Booking confirmation emails** now include "Add to Google Calendar" links and embedded cancellation deep-links.
- **Ministry Event capacity enforcement** — "Sunday Service" and non-meeting Ministry Events now auto-fill room to max capacity, blocking concurrent groups.
- **Admin bookings** now tracked via `is_admin_booking` column instead of relying on empty leader names.

### Removed
- **7-day advance booking limit for regular users** — Users can now book up to 6 months in advance (same as admins). The 72-hour minimum notice restriction was also removed.
- **Direct Google Sheets API access** — Frontend no longer reads directly from Sheets; all reads go through the Apps Script gateway.
- **Legacy `Code.gs` monolith** — Replaced by modular architecture.

### Fixed
- **Timezone mismatch bug** — Stored booking times (Manila local with fake `Z` suffix) are now correctly parsed with `+08:00` offset in conflict detection, eliminating phantom morning overlaps.
- **Duration display** — Fixed duration showing in minutes instead of hours.

---

## [1.6] — 2026-02-01

### Added
- Interactive Table Selection Floorplan for Main Hall bookings.
- Squeeze Logic (auto-upgrade to Main Hall when eligible).
- Recurrent booking support (Weekly, Monthly, Quarterly, First Wednesday, Last Saturday).
- Admin Dashboard with D3.js visualizations.
- Privacy Policy page (`privacy.html`).

---

## [1.0] — 2025-11-01

### Added
- Initial release of the Room Reservation System.
- Multi-room calendar (Main Hall, Jonah, Joseph, Moses).
- 30-minute time slot booking with form validation.
- Google Apps Script backend with Google Sheets database.
- Email confirmations via `MailApp`.
- Admin PIN authentication.
- Tailwind CSS responsive design.
