
# Room Reservation System Process Map

This document outlines the end-to-end journey of a user or admin creating a booking, detailing the interactions between the Frontend, Backend (Google Apps Script), and Google Services.

| Step | Actor (Swimlane) | Action | Feature / Scenario / Decision |
| :--- | :--- | :--- | :--- |
| **Start** | User / Admin | Decides to book and opens the app URL. | |
| 1 | User / Admin | Opens the reservation app URL. | |
| 2 | Frontend | Loads `index.html` & `script.js`. Populates room dropdown (default: "Main Hall"). | **Feature:** Multi-Room Selection |
| 3 | Frontend | Calls Google Sheets API to get current bookings (`fetchAllBookings`). | **Feature:** Data Fetching |
| 4 | Frontend | Renders the calendar for "Main Hall", calculating capacity colors (Red/Yellow/Blue). | **Feature:** Dynamic Capacity Calendar |
| 5 | User / Admin | *Scenario: User selects a different room (e.g., "Jonah").* | **Feature:** Multi-Room Selection |
| 6 | Frontend | `roomSelector` listener fires. Calls `render()` to redraw calendar for "Jonah". | |
| 7 | User / Admin | Navigates weeks and clicks on a desired time slot. | |
| 8 | Frontend | `handleSlotClick` triggered. | **Decision:** Is slot "Available"?<br>• **YES:** Go to Step 10<br>• **NO (Partial/Full):** Go to Step 9 |
| 9 | Frontend | Displays "What would you like to do?" modal. | **Feature:** Choice Modal<br>*Scenario: User clicks "Book a New Slot" -> Go to Step 9b* |
| 9b | Frontend | Opens `openTimeSelectionModal`. User selects **End Time**. | **Feature:** Intermediate Time Selection |
| 10 | Frontend | Calls `openBookingModalForSelectedSlot`. Modal opens. Displays **Duration** (hrs). | **Feature:** Dynamic Booking Modal |
| 11 | Frontend | Checks `ROOM_CONFIG` and slot capacity. Sets `min` and `max` attributes on inputs. | **Feature:** Dynamic Participant Rules |
| 12 | User / Admin | Fills out the booking form. | **Decision:** Is user Admin?<br>• **NO:** Fills all fields (inc. Leader)<br>• **YES:** Go to Step 13 |
| 13 | User / Admin | Clicks "I am an Admin" checkbox. | |
| 14 | Frontend | `admin-toggle` listener fires. Hides User fields, shows Admin PIN & Recurrence. | **Feature:** Admin Role UI |
| 15 | Frontend | Calls `renderEventDropdown(true)` to populate Admin-only events. | **Feature:** Dynamic Event Dropdown |
| 16 | User / Admin | *Scenario: Admin selects "Ministry Event - B1G Fridays".* | |
| 17 | Frontend | `#event` listener detects `setsMaxCapacity`. Auto-fills participants to room total (e.g., 55). | **Feature:** Admin Max Capacity |
| 18 | User / Admin | Finishes form and clicks "Confirm Booking". | |
| 19 | Frontend | `handleBookingFormSubmit` runs validation. | **Feature:** Client-Side Validation<br>**Decision:** Passed?<br>• **NO:** Show Toast [END]<br>• **YES:** Go to Step 20 |
| 20 | Frontend | Populates and shows `#confirm-summary-modal`. Includes **Duration**. | **Feature:** Booking Summary Modal |
| 21 | User / Admin | Reviews summary and clicks "Yes, Confirm". | |
| 22 | Frontend | Calls `proceedWithBooking`. Shows `#loading-modal`. | **Feature:** Loading Modal |
| 23 | Frontend | Calls `submitRequest`. Sends JSONP payload to Apps Script. | |
| 24 | Backend | `doGet` parses payload. Calls `handleCreateBooking`. | |
| 25 | Backend | Checks if `adminPin` matches `ADMIN_PIN` constant. Sets `isAdmin = true`. | **Feature:** Admin PIN Check |
| 26 | Backend | Checks Booking Prioritization. | **Feature:** Booking Prioritization<br>**Decision:** User + Mezzanine?<br>• **YES:** Check Main Hall capacity -> Redirect if open<br>• **NO:** Keep requested room |
| 27 | Backend | Calls `validateInput`. | **Feature:** Server-Side Validation<br>• **Admin:** 6-month window, bypass size limit<br>• **User:** 7-day window, enforce size limit |
| 28 | Backend | Checks Validation Results. | **Decision:** Valid?<br>• **NO:** Throw Error -> Step 34<br>• **YES:** Go to Step 29 |
| 29 | Backend | Checks Recurrence. | **Feature:** Recurrent Bookings<br>**Decision:** Recurrent?<br>• **YES:** Call `handleRecurrentBooking` -> Step 31<br>• **NO:** Go to Step 30 |
| 30 | Backend | Calls `appendBookingRow` for single event. | |
| 31 | Google Services | Writes 15-column data to "Bookings" Sheet. | |
| 32 | Backend | Calls `sendConfirmationEmail`. Builds HTML body. | **Feature:** Email Confirmation |
| 33 | Google Services | Sends email via `MailApp`. | |
| 34 | Backend | Returns JSONP response. | Success or Error message. |
| 35 | Frontend | `window[callbackName]` receives response. Closes loader. | |
| 36 | Frontend | Checks Response Status. | **Decision:** Success?<br>• **NO:** Show Toast Error [END]<br>• **YES:** Go to Step 37 |
| 37 | Frontend | Shows `#success-modal` with Booking Code. | **Feature:** Success Modal |
| 38 | Frontend | Compares `bookedRoom` vs `requestedRoom`. Displays redirect message if needed. | **Feature:** Prioritization UI |
| 39 | User / Admin | Clicks "Done". Receives email. | **End of Process** |