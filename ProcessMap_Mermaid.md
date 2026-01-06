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