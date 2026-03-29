
# Room Reservation System Process Map

This document outlines the end-to-end journey of a user or admin creating a booking, detailing the interactions between the Frontend, Backend (Google Apps Script), and Google Services.

| Step | Actor (Swimlane) | Action | Feature / Scenario / Decision |
| :--- | :--- | :--- | :--- |
| **Start** | User / Admin | Decides to book OR clicks an Email Cancel link. | |
| 1 | User / Admin | Opens the reservation app URL. | |
| 2 | Frontend | Loads `index.html` & `script.js`. Checks URL parameters for cancellation codes. | **Feature:** Email Cancellation Deep Linking<br>• IF Cancel Code exists: Go to Step C1 |
| 3 | Frontend | Shows Role Selection Modal. User enters PIN (if Admin) or proceeds as regular User. | **Feature:** Role-based Authorization |
| 4 | Frontend | Calls Google Sheets API to get current bookings (`fetchAllBookings`). | **Feature:** Data Fetching |
| 5 | Frontend | Renders the calendar for "Main Hall", calculating capacity colors. | **Feature:** Dynamic Capacity Calendar |
| 6 | User / Admin | *Scenario: User selects a different room (e.g., "Jonah").* | **Feature:** Multi-Room Selection |
| 7 | User / Admin | Navigates weeks and clicks on a desired time slot. | |
| 8 | Frontend | `handleSlotClick` triggered. | **Decision:** Is slot "Available"?<br>• **YES:** Go to Step 10<br>• **NO (Partial/Full):** Go to Step 9 |
| 9 | Frontend | Displays "What would you like to do?" choice modal. | **Feature:** Admin/User Choice Modal<br>*Scenario: User clicks "Book a New Slot" -> Go to Step 10* |
| 10 | Frontend | Opens `openTimeSelectionModal`. User selects **End Time** from strict 30-min dropdowns. | **Feature:** 30-Min Time Strict Increment Selection |
| 11 | Frontend | Calls `openBookingModalForSelectedSlot`. Modal opens. Displays **Duration** (hrs). | **Feature:** Dynamic Booking Modal |
| 12 | Frontend | Checks `ROOM_CONFIG` and slot capacity. Implements **Date Range Verification** (72hrs to 7/180days). | **Feature:** Date Window Verification |
| 13 | Frontend | Adjusts form dynamically based on `state.isAdmin`. Admins see Recurrence, Users see Dgroup fields. | **Feature:** Role-Based Form Rendering |
| 14 | User / Admin | Fills out the combined booking form and checks Terms/Privacy flags. | |
| 15 | Frontend | `handleBookingFormSubmit` runs validation. | **Feature:** Client-Side Validation<br>**Decision:** Passed?<br>• **NO:** Show Toast<br>• **YES:** Go to Step 16 |
| 16 | Frontend | Triggers `checkMainHallAvailability` (Squeeze Logic). | **Feature:** Main Hall Auto-Upgrade<br>**Decision:** Room is open & User Eligible?<br>• **YES:** Go to Step 17<br>• **NO:** Go to Step 18 |
| 17 | Frontend | Opens Interactive Table Selection Floorplan. User picks table. | **Feature:** Interactive Floorplan |
| 18 | Frontend | Populates and shows `#confirm-summary-modal`. Warns if Auto-Upgraded. | **Feature:** Booking Summary Modal |
| 19 | User / Admin | Reviews summary and clicks "Yes, Confirm". | |
| 20 | Frontend | Calls `proceedWithBooking`. Shows `#loading-modal`. | **Feature:** Loading Modal |
| 21 | Frontend | Calls `submitRequest`. Sends Payload (with `app_url`) to Apps Script. | |
| 22 | Backend | `doGet` parses payload. Action mapped to `handleCreateBooking`. | |
| 23 | Backend | Calls `validateInput`. Enforces backend guards against race conditions. | **Feature:** Server-Side Validation & Safety Guards |
| 24 | Backend | Checks Validation Results (e.g. Unregistered User). | **Feature:** Validation Enforcement<br>**Decision:** Valid?<br>• **NO:** Call `sendDeniedEmail` to Leader -> Step 31<br>• **YES:** Go to Step 25 |
| 25 | Backend | Checks Recurrence. | **Feature:** Recurrent Bookings<br>**Decision:** Recurrent?<br>• **YES:** Call `handleRecurrentBooking` -> Step 27<br>• **NO:** Go to Step 26 |
| 26 | Backend | Calls `appendBookingRow` for single event. | |
| 27 | Google Services | Writes 15+ column data to "Bookings" Sheet. | |
| 28 | Backend | Calls `sendConfirmationEmail`. Builds HTML body including embedded absolute `app_url` cancellation links. | **Feature:** Rich HTML Email Confirmation |
| 29 | Google Services | Sends email via `MailApp`. | |
| 30 | Backend | Returns JSONP response. | Success or Error message. |
| 31 | Frontend | `window[callbackName]` receives response. Closes loader. | |
| 32 | Frontend | Checks Response Status. | **Decision:** Success?<br>• **NO:** Show Alert Modal or Toast<br>• **YES:** Go to Step 33 |
| 33 | Frontend | Shows `#success-modal` with Booking Code. | **Feature:** Success Modal |
| C1 | Frontend | Email deep-link detected. Triggers `handleEmailCancelDeepLink`. Opens `#email-cancel-confirm-modal` | **Feature:** Direct Email Cancellation |
| C2 | Frontend | Calls `submitPendingCancellation`. Send JSONP to Backend. | |
| C3 | Backend | Action mapped to `handleCancelBooking`. Updates status to `CANCELLED`. | |
| C4 | Backend | Calls `sendCancelEmail`. Google `MailApp` fires. Returns Success. | |