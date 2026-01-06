# Booking System Process Map

This document outlines the end-to-end journey of a user or admin creating a booking, detailing the interactions between the Frontend, Backend (Google Apps Script), and Google Services.

## Process Flowchart

```mermaid
graph TD
    %% Styling
    classDef actor fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef frontend fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef backend fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px;
    classDef google fill:#f3e5f5,stroke:#4a148c,stroke-width:2px;

    %% Nodes
    Start((Start))
    End((End))

    subgraph User_Admin [User / Admin]
        direction TB
        Step1[1. Open App URL]:::actor
        Step5{5. Select Different Room?}:::actor
        Step7[7. Click Time Slot]:::actor
        Step12[12. Fill Booking Form]:::actor
        Step13{13. Is Admin?}:::actor
        Step16[16. Select Admin Event]:::actor
        Step18[18. Confirm Booking]:::actor
        Step21[21. Review & Confirm]:::actor
    end

    subgraph Frontend_UI [Frontend]
        direction TB
        Step2[2. Load UI & Default Room]:::frontend
        Step3[3. Fetch Data]:::frontend
        Step4[4. Render Calendar]:::frontend
        Step6[6. Re-render Calendar]:::frontend
        Step8{8. Is Slot Available?}:::frontend
        Step9[9. Show Choice Modal]:::frontend
        Step10[10. Open Booking Modal]:::frontend
        Step11[11. Set Rules & Limits]:::frontend
        Step14[14. Show Admin UI]:::frontend
        Step15[15. Load Admin Events]:::frontend
        Step17[17. Auto-fill Capacity]:::frontend
        Step19{19. Valid Form?}:::frontend
        Step20[20. Show Summary Modal]:::frontend
        Step22[22. Show Loading]:::frontend
        Step23[23. Send Request]:::frontend
        Step35[35. Receive Response]:::frontend
        Step36{36. Success?}:::frontend
        Step37[37. Show Success Modal]:::frontend
        Step38[38. Check Redirect/Prioritization]:::frontend
        Toast[Show Error Toast]:::frontend
    end

    subgraph Backend_GAS [Backend Google Apps Script]
        direction TB
        Step24[24. Handle Request]:::backend
        Step25[25. Verify Admin PIN]:::backend
        Step26[26. Check Prioritization logic]:::backend
        Step27[27. Validate Input]:::backend
        Step28{28. Valid?}:::backend
        Step29{29. Recurrent?}:::backend
        Step30[30. Append Booking Row]:::backend
        Step32[32. Build Confirmation Email]:::backend
        Step34[34. Return JSON Response]:::backend
        RecurLoop[Handle Recurrence Loop]:::backend
    end

    subgraph Google_Services [Google Services]
        direction TB
        Step31[(31. Write to Sheets)]:::google
        Step33[33. Send Email via MailApp]:::google
    end

    %% Connections
    Start --> Step1
    Step1 --> Step2
    Step2 --> Step3
    Step3 --> Step4
    Step4 --> Step5
    
    Step5 -- Yes --> Step6
    Step6 --> Step7
    Step5 -- No --> Step7
    
    Step7 --> Step8
    Step8 -- Partial/Full --> Step9
    Step9 -- User clicks Book --> Step10
    Step8 -- Available --> Step10
    
    Step10 --> Step11
    Step11 --> Step12
    Step12 --> Step13
    
    Step13 -- Yes --> Step14
    Step14 --> Step15
    Step15 --> Step16
    Step16 --> Step17
    Step17 --> Step18
    Step13 -- No --> Step18
    
    Step18 --> Step19
    Step19 -- No --> Toast
    Step19 -- Yes --> Step20
    
    Step20 --> Step21
    Step21 --> Step22
    Step22 --> Step23
    Step23 --> Step24
    
    Step24 --> Step25
    Step25 --> Step26
    Step26 --> Step27
    Step27 --> Step28
    
    Step28 -- No --> Step34
    Step28 -- Yes --> Step29
    
    Step29 -- Yes --> RecurLoop
    RecurLoop --> Step31
    Step29 -- No --> Step30
    Step30 --> Step31
    
    Step31 --> Step32
    Step32 --> Step33
    Step33 --> Step34
    
    Step34 --> Step35
    Step35 --> Step36
    Step36 -- No --> Toast
    Step36 -- Yes --> Step37
    Step37 --> Step38
    Step38 --> End

# Booking System Process Map

This document outlines the end-to-end journey of a user or admin creating a booking, detailing the interactions between the Frontend, Backend (Google Apps Script), and Google Services.

| Step | Actor (Swimlane) | Action | Feature / Scenario / Decision |
| :--- | :--- | :--- | :--- |
| **Start** | User / Admin | Decides to book and opens the app URL. | |
| 1 | User / Admin | Opens the booking app URL. | |
| 2 | Frontend | Loads `index.html` & `script.js`. Populates room dropdown (default: "Main Hall"). | **Feature:** Multi-Room Selection |
| 3 | Frontend | Calls Google Sheets API to get current bookings (`fetchAllBookings`). | **Feature:** Data Fetching |
| 4 | Frontend | Renders the calendar for "Main Hall", calculating capacity colors (Red/Yellow/Blue). | **Feature:** Dynamic Capacity Calendar |
| 5 | User / Admin | *Scenario: User selects a different room (e.g., "Jonah").* | **Feature:** Multi-Room Selection |
| 6 | Frontend | `roomSelector` listener fires. Calls `render()` to redraw calendar for "Jonah". | |
| 7 | User / Admin | Navigates weeks and clicks on a desired time slot. | |
| 8 | Frontend | `handleSlotClick` triggered. | **Decision:** Is slot "Available"?<br>• **YES:** Go to Step 10<br>• **NO (Partial/Full):** Go to Step 9 |
| 9 | Frontend | Displays "What would you like to do?" modal. | **Feature:** Choice Modal<br>*Scenario: User clicks "Book a New Slot" -> Go to Step 10* |
| 10 | Frontend | Calls `openBookingModalForSelectedSlot`. Modal opens. | **Feature:** Dynamic Booking Modal |
| 11 | Frontend | Checks `ROOM_CONFIG` and slot capacity. Sets `min` and `max` attributes on inputs. | **Feature:** Dynamic Participant Rules |
| 12 | User / Admin | Fills out the booking form. | **Decision:** Is user Admin?<br>• **NO:** Fills all fields (inc. Leader)<br>• **YES:** Go to Step 13 |
| 13 | User / Admin | Clicks "I am an Admin" checkbox. | |
| 14 | Frontend | `admin-toggle` listener fires. Hides User fields, shows Admin PIN & Recurrence. | **Feature:** Admin Role UI |
| 15 | Frontend | Calls `renderEventDropdown(true)` to populate Admin-only events. | **Feature:** Dynamic Event Dropdown |
| 16 | User / Admin | *Scenario: Admin selects "Ministry Event - B1G Fridays".* | |
| 17 | Frontend | `#event` listener detects `setsMaxCapacity`. Auto-fills participants to room total (e.g., 55). | **Feature:** Admin Max Capacity |
| 18 | User / Admin | Finishes form and clicks "Confirm Booking". | |
| 19 | Frontend | `handleBookingFormSubmit` runs validation. | **Feature:** Client-Side Validation<br>**Decision:** Passed?<br>• **NO:** Show Toast [END]<br>• **YES:** Go to Step 20 |
| 20 | Frontend | Populates and shows `#confirm-summary-modal`. | **Feature:** Booking Summary Modal |
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