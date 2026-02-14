# CCF Manila Booking System

![Version](https://img.shields.io/badge/version-1.5-blue.svg)
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

## 🚀 Top 10 High-Level Features

1.  **Optimization of Main Hall Usage**: Smart "waterfall" logic automatically checks Main Hall availability when users select overflow rooms, maximizing efficient space management.
2.  **GDPR Compliance & Data Privacy**: A dedicated "My Bookings" portal allows users to securely view, download (Export), or permanently delete their personal data.
3.  **Advanced Admin Dashboard**: A restricted, PIN-protected view featuring D3.js Gantt charts, mobile-optimized metric cards, and data tables for high-level oversight.
4.  **Role-Based Access Control (RBAC)**: Distinguishes between **Users** (7-day booking window, strict limits) and **Admins** (6-month window, capacity overrides, PIN access).
5.  **Recurrent Booking Engine**: Allows Admins to schedule complex visiting patterns (e.g., "Every Friday", "First Monday of the Month") in a single action.
6.  **Smart Conflict Detection**: Automatically detects double-bookings during creation or rescheduling ("Move") and warns the user with actionable options.
7.  **Visual Calendar Clarity**: A color-coded weekly view featuring a new **Left Sidebar Legend**, distinct **AM/PM dividers**, and simplified time labels for instant scanning.
8.  **Mobile-First Design**: The interface adapts seamlessly to phones and tablets, with vertically stacking cards and collapsible grids for on-the-go management.
9.  **Automated Email Notifications**: Instantly sends branded confirmation emails to the booker via Google MailApp upon successful submission.
10. **Multi-Room Configuration**: Supports distinct rules (Capacity, participant limits) for different spaces like "Main Hall" vs. "Annex" without requiring separate tools.

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