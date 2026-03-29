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
        Step12[5. Fill Booking Form]:::actor
        StepTable[6. Select Main Hall Table]:::actor
        Step18[7. Confirm Creation]:::actor
        StepC_Deep[C1. Click Email Cancel Link]:::actor
    end

    subgraph Frontend_UI [Frontend Logic]
        direction TB
        StepLoad[Load UI & Fetch Data]:::frontend
        StepRoleModal[Show Role Selection Modal]:::frontend
        StepSetAdmin[Set Admin Mode / Validate PIN]:::frontend
        Step8{Is Slot Empty?}:::frontend
        Step9[Show Choice Modal]:::frontend
        StepTime[Show Time Selection]:::frontend
        Step10[Open Booking Modal]:::frontend
        Step19{Valid Form?}:::frontend
        StepSqueeze{Check Squeeze Logic}:::frontend
        StepTableModal[Show Floorplan Modal]:::frontend
        Step23[Send 'Create' Request]:::frontend
        StepParse[Parse URL Params]:::frontend
        StepC_UI[Open Cancel Modal]:::frontend
        StepC_Send[Send 'Cancel' Request]:::frontend
    end

    subgraph Backend_GAS [Backend Google Apps Script]
        direction TB
        Step24[Handle Request Type]:::backend
        Step27[Create: Validate Range & Input]:::backend
        StepDeny[Send Denied Email to Leader]:::backend
        StepAppend[Append to Sheet]:::backend
        StepBackend_Cancel[Cancel: Update Status]:::backend
        Step32[Build Confirmation/Cancel Email]:::backend
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
    Step19 -- "No" --> Toast[Show Error Toast]:::frontend
    Step19 -- "Yes" --> StepSqueeze
    StepSqueeze -- "Eligible for Main Hall" --> StepTableModal
    StepTableModal --> StepTable
    StepTable --> Step18
    StepSqueeze -- "Standard Room" --> Step18
    Step18 --> Step23
    Step23 --> Step24

    %% -- CANCEL BRANCH --
    Step9_Dec -- "Cancel Booking" --> StepC_UI
    StepC_UI --> StepC_Send
    StepC_Send --> Step24
    
    %% -- BACKEND ROUTING --
    Step24 -- "Action: Create" --> Step27
    Step24 -- "Action: Cancel" --> StepBackend_Cancel

    %% -- DB & NOTIFICATIONS --
    Step27 -- "Validation Failed" --> StepDeny
    StepDeny --> Step33
    Step27 -- "Validation Passed" --> StepAppend
    StepAppend --> Step31
    StepBackend_Cancel --> Step31
    
    Step31 --> Step32
    Step32 --> Step33
    Step33 --> Step34
    
    %% -- RESPONSE --
    Step34 --> End