# CCF Manila Room Reservation System — Process Flow Diagram

> **Version:** 2.0  
> Complete Mermaid flowchart of all User and Admin journeys including **Booking**, **Cancellation**, **Email Deep-Link Cancellation**, **Move/Reschedule**, **GDPR**, and **Block Dates** workflows.

---

## Swimlane Legend

| Color | Layer | Description |
|-------|-------|-------------|
| 🔵 Light Blue | User / Admin Interactions | Human actions (clicks, form fills, decisions) |
| 🟠 Orange | Frontend Logic | Client-side validation, UI rendering, API calls |
| 🟢 Green | Backend (Apps Script) | Server-side validation, business logic, data operations |
| 🟣 Purple | Google Services | Google Sheets I/O, MailApp email sending |

---

## Flow Diagram

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
        StepRole{2. Select Role}:::actor
        Step7[3. Click Time Slot]:::actor
        Step9_Dec{4. Action Choice?}:::actor
        StepGDPR_Btn[Click 'My Bookings']:::actor
        
        %% Create Flow
        Step12[5. Fill Booking Form]:::actor
        StepTable[6. Select Main Hall Table]:::actor
        Step18[7. Confirm Creation]:::actor
        
        %% Cancel Flow
        StepC_Deep[C1. Click Email Cancel Link]:::actor
        StepC1[C2. Select Booking from List]:::actor
        StepC2[C3. Verify Email / Admin PIN]:::actor
        
        %% Move Flow
        StepM1[M1. Input New Schedule]:::actor
        StepM3{M2. Proceed w/ Conflict?}:::actor
        StepM4[M3. Confirm Move Summary]:::actor
        
        %% GDPR Flow
        StepGDPR_Action{Action?}:::actor
    end

    subgraph Frontend_UI [Frontend Logic]
        direction TB
        StepLoad[Load UI & Fetch Data]:::frontend
        StepRoleModal[Show Role Selection Modal]:::frontend
        StepSetAdmin[Set Admin Mode / Validate PIN]:::frontend
        Step8{Is Slot Empty?}:::frontend
        Step9[Show Choice Modal]:::frontend
        
        %% Create Logic
        StepTime[Show Time Selection]:::frontend
        Step10[Open Booking Modal]:::frontend
        Step19{Valid Form?}:::frontend
        StepSqueeze{Check Squeeze Logic}:::frontend
        StepTableModal[Show Floorplan Modal]:::frontend
        Step23[Send 'Create' Request]:::frontend
        
        %% Cancel Logic
        StepParse[Parse URL Params]:::frontend
        StepC_UI[Open Cancel Modal]:::frontend
        StepC_Send[Send 'Cancel' Request]:::frontend
        
        %% Move Logic
        StepM_UI[Open Move Modal]:::frontend
        StepM_Check{Conflict Check}:::frontend
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
        Step24[Handle Request Type]:::backend
        
        %% Create Path
        Step27[Create: Validate Range & Input]:::backend
        StepDeny[Send Denied Email to Leader]:::backend
        StepAppend[Append to Sheet]:::backend
        
        %% Cancel Path
        StepBackend_Cancel[Cancel: Update Status]:::backend
        
        %% Move Path
        StepBackend_Move[Move: Update Date/Time/Room]:::backend
        
        %% GDPR Path
        StepBackend_Export[Export: Fetch Data]:::backend
        StepBackend_Delete[Delete: Anonymize Data]:::backend
        
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
    Step1 --> StepLoad
    StepLoad --> StepRoleModal
    StepRoleModal --> StepRole
    StepRole -- "Enter PIN" --> StepSetAdmin
    StepRole -- "User" --> StepSetAdmin
    StepSetAdmin --> Step7
    StepSetAdmin --> StepGDPR_Btn
    
    %% -- EMAIL DEEP LINK BYPASS --
    Start --> StepC_Deep
    StepC_Deep --> StepLoad
    StepLoad --> StepParse
    StepParse --> StepC_UI

    Step7 --> Step8
    Step8 -- "Empty" --> StepTime
    Step8 -- "Booked / Partial" --> Step9
    Step9 --> Step9_Dec

    %% -- CREATE BRANCH --
    Step9_Dec -- "Book New" --> StepTime
    StepTime --> Step10
    Step10 --> Step12
    Step12 --> Step19
    Step19 -- "No" --> Toast
    Step19 -- "Yes" --> StepSqueeze
    StepSqueeze -- "Eligible for Main Hall" --> StepTableModal
    StepTableModal --> StepTable
    StepTable --> Step18
    StepSqueeze -- "Standard Room" --> Step18
    Step18 --> Step23
    Step23 --> Step24

    %% -- CANCEL BRANCH --
    Step9_Dec -- "Cancel Booking" --> StepC1
    StepC1 --> StepC2
    StepC2 --> StepC_Send
    StepC_UI --> StepC_Send
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
    Step27 -- "Validation Failed" --> StepDeny
    StepDeny --> Step33
    Step27 -- "Validation Passed" --> StepAppend
    StepAppend --> Step31
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
```
