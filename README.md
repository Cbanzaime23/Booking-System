# CCF Manila Room Reservation System

![Version](https://img.shields.io/badge/version-1.6-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)
![Tech](https://img.shields.io/badge/stack-HTML%20%7C%20JS%20%7C%20Google%20Apps%20Script-orange)

A comprehensive, serverless room reservation web application designed for **CCF Manila**. This system replaces manual scheduling with a real-time, digital interface that synchronizes directly with Google Sheets, allowing users to check room availability and book slots while providing Administrators with powerful management tools.

---

## 📖 Table of Contents
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Project Structure](#-project-structure)
- [Installation & Setup](#-installation--setup)
- [Configuration](#-configuration)
- [Documentation](#-documentation)

---

## ✨ Features

### 👤 User Experience & Booking Interface
*   **Visual Calendar**: Interactive weekly view with sticky headers, clear AM/PM dividers, and a "Last Updated" freshness status bar.
*   **Multi-Room Support**: Seamless switching between rooms (Main Hall, Jonah, Joseph, Moses) with real-time capacity badges.
*   **Duration Visibility**: Real-time duration calculation (e.g., "1.5 hrs") displayed during time selection and in the booking modal.
*   **Smart Form Validation**:
    *   **Typo Detection**: "Confirm Email" field warns users of common typos (e.g., "gmial.com").
    *   **Logic Checks**: Prevents invalid times (End < Start), past dates, or exceeding room capacity.
*   **Consent Management**: Mandatory Terms & Conditions and Privacy Policy checkboxes.
*   **Mobile-First Design**: Fully responsive layout that adapts to desktops, tablets, and mobile phones.

### 📅 Booking Management (User Side)
*   **My Bookings Portal**: Secure, email-based lookup for users to view their active schedule.
*   **Self-Service Actions**: Users can **Cancel** or **Reschedule (Move)** their own bookings without contacting admin.
*   **Duplicate Prevention**: System actively prevents users from double-booking themselves for the same slot.
*   **GDPR Compliance**: Built-in tools for users to **Export** their data or request **Deletion** (Right to be Forgotten).

### 🛡️ Admin Capabilities & Dashboard
*   **Secure Admin Mode**: PIN-protected toggle unlocks privileged features.
*   **Analytics Dashboard**:
    *   **Key Metrics**: Real-time counters for Total Bookings, Participants, and Room Utilization.
    *   **Weekly Admin Horizon**: A dedicated scrollable view of upcoming church-led events for the next 7 days.
    *   **Visualizations**: D3.js Gantt Timeline and Donut charts.
    *   **Search**: Filter bookings by Name, Email, or Date.
*   **Advanced Controls**:
    *   **Policy Overrides**: Book up to 6 months in advance (vs. 7 days) and bypass minimum notice periods.
    *   **Recurrent Bookings**: Schedule repeating events (Daily, Weekly, Monthly) in a single action.
    *   **Force Booking**: Capability to override conflicts if necessary.
*   **Block Dates**: Tool to close specific rooms for holidays/maintenance, automatically cancelling conflicting bookings and notifying users.
*   **Global Announcements**: Manage a site-wide alert banner directly from Google Sheets.

### ⚙️ System & Reliability
*   **Race Condition Guard**: "Optimistic Locking" and double-read logic prevents overbooking when multiple users try to book the same slot simultaneously.
*   **Network Recovery**: Robust error handling with auto-retry mechanisms and interactive toast notifications for flaky connections.
*   **Smart Optimization**: "Waterfall" logic suggests moving small groups from large halls to smaller rooms to optimize space usage.
*   **Serverless Backend**: Powered entirely by Google Apps Script and Google Sheets.

### 🔔 Notifications
*   **Automated Emails**: Instant branding-aware HTML confirmations sent via Google `MailApp`.
*   **Calendar Integration**: Emails include direct "Add to Google Calendar" links for one-click scheduling.
*   **Lifecycle Updates**: Automated notifications for Cancellations, Reschedules, or Admin-initiated blocks.

---

## 🛠 Tech Stack

* **Frontend:** HTML5, Vanilla JavaScript (ES6+), Tailwind CSS (via CDN).
* **Backend / API:** Google Apps Script (GAS) deployed as a Web App.
* **Database:** Google Sheets (Acting as a relational database).
* **Libraries:**
    * `Luxon.js` (Date & Time manipulation)
    * `Google Fonts` (Typography)
    * `Lucide` (Icons via SVG)

---

## 🔄 System Architecture

The following flowchart illustrates the complete User and Admin journey, including **Booking**, **Cancellation**, **Rescheduling (Move)**, and **GDPR** workflows.

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

    subgraph User_Admin [User / Admin Interactions]
        direction TB
        Step1[1. Open App URL]:::actor
        Step7[7. Click Time Slot]:::actor
        Step9_Dec{9. Action Choice?}:::actor
        StepGDPR_Btn[Click 'My Bookings']:::actor
        
        %% Create Flow
        Step12[12. Fill Booking Form]:::actor
        Step18[18. Confirm Creation]:::actor
        
        %% Cancel Flow
        StepC1[C1. Select Booking to Cancel]:::actor
        StepC2[C2. Verify Email / Admin PIN]:::actor
        
        %% Move Flow
        StepM1[M1. Input New Schedule]:::actor
        StepM3{M3. Proceed w/ Conflict?}:::actor
        StepM4[M4. Confirm Move Summary]:::actor
        
        %% GDPR Flow
        StepGDPR_Action{Action?}:::actor
    end

    subgraph Frontend_UI [Frontend Logic]
        direction TB
        Step2[2. Load UI & Fetch Data]:::frontend
        Step8{8. Is Slot Empty?}:::frontend
        Step9[9. Show Choice Modal]:::frontend
        
        %% Create Logic
        Step10[10. Open Booking Modal]:::frontend
        Step19{19. Valid Form?}:::frontend
        Step23[23. Send 'Create' Request]:::frontend
        
        %% Cancel Logic
        StepC_UI[Open Cancel Modal]:::frontend
        StepC_Send[Send 'Cancel' Request]:::frontend
        
        %% Move Logic
        StepM_UI[Open Move Modal]:::frontend
        StepM_Check{M2. Conflict Check}:::frontend
        StepM_Warn[Show Conflict Modal]:::frontend
        StepM_Sum[Show Summary Modal]:::frontend
        StepM_Send[Send 'Move' Request]:::frontend
        
        %% GDPR Logic
        StepGDPR_Modal[Show My Bookings Modal]:::frontend
        StepGDPR_Req[Send Export/Delete Request]:::frontend
        
        %% Common
        Step36{Success?}:::frontend
        Step37[Show Success Modal]:::frontend
        Toast[Show Error Toast]:::frontend
    end

    subgraph Backend_GAS [Backend Google Apps Script]
        direction TB
        Step24[24. Handle Request Type]:::backend
        
        %% Create Path
        Step27[Create: Validate & Append]:::backend
        
        %% Cancel Path
        StepBackend_Cancel[Cancel: Update Status 'CANCELLED']:::backend
        
        %% Move Path
        StepBackend_Move[Move: Update Date/Time/Room]:::backend
        
        %% GDPR Path
        StepBackend_Export[Export: Fetch User Data]:::backend
        StepBackend_Delete[Delete: Remove/Anonymize User Data]:::backend
        
        %% Common
        Step32[Build Email Notification]:::backend
        Step34[Return JSON Response]:::backend
    end

    subgraph Google_Services [Google Services]
        direction TB
        Step31[(Write to Sheets)]:::google
        Step33[Send Email via MailApp]:::google
    end

    %% -- MAIN FLOW --
    Start --> Step1
    Step1 --> Step2
    Step2 --> Step7
    Step2 --> StepGDPR_Btn
    Step7 --> Step8
    
    Step8 -- "Empty" --> Step10
    Step8 -- "Booked / Partial" --> Step9
    Step9 --> Step9_Dec

    %% -- CREATE BRANCH --
    Step9_Dec -- "Book New" --> Step10
    Step10 --> Step12
    Step12 --> Step18
    Step18 --> Step19
    Step19 -- Yes --> Step23
    Step19 -- No --> Toast
    Step23 --> Step24

    %% -- CANCEL BRANCH --
    Step9_Dec -- "Cancel Booking" --> StepC_UI
    StepC_UI --> StepC1
    StepC1 --> StepC2
    StepC2 --> StepC_Send
    StepC_Send --> Step24
    
    %% -- GDPR BRANCH --
    StepGDPR_Btn --> StepGDPR_Modal
    StepGDPR_Modal --> StepGDPR_Action
    StepGDPR_Action -- "Download" --> StepGDPR_Req
    StepGDPR_Action -- "Delete" --> StepGDPR_Req
    StepGDPR_Req --> Step24

    %% -- MOVE BRANCH (Admin) --
    Step9_Dec -- "Move (Admin)" --> StepM_UI
    StepM_UI --> StepM1
    StepM1 --> StepM_Check
    
    StepM_Check -- "No Conflict" --> StepM_Sum
    StepM_Check -- "Conflict!" --> StepM_Warn
    StepM_Warn --> StepM3
    StepM3 -- "Yes (Double Book)" --> StepM_Sum
    StepM3 -- "No" --> End
    
    StepM_Sum --> StepM4
    StepM4 --> StepM_Send
    StepM_Send --> Step24

    %% -- BACKEND ROUTING --
    Step24 -- "Action: Create" --> Step27
    Step24 -- "Action: Cancel" --> StepBackend_Cancel
    Step24 -- "Action: Move" --> StepBackend_Move
    Step24 -- "Action: Export" --> StepBackend_Export
    Step24 -- "Action: Delete" --> StepBackend_Delete

    %% -- DB & NOTIFICATIONS --
    Step27 --> Step31
    StepBackend_Cancel --> Step31
    StepBackend_Move --> Step31
    StepBackend_Export --> Step31
    StepBackend_Delete --> Step31
    
    Step31 --> Step32
    Step32 --> Step33
    Step33 --> Step34
    
    %% -- RESPONSE --
    Step34 --> Step36
    Step36 -- Yes --> Step37
    Step36 -- No --> Toast
    Step37 --> End