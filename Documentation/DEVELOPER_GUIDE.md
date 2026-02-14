CCF Manila Booking System - Developer Guide

1. Architecture Overview

This is a Serverless Single-Page Application (SPA).

Frontend: Static HTML/CSS/JS hosted on GitHub Pages.

Backend: Google Apps Script (GAS) acting as a lightweight API.

Database: Google Sheets.

Data Flow

Read: The frontend fetches data directly from the Google Sheets API (v4) for speed and efficiency.

Write: The frontend sends data to the Google Apps Script Web App URL via JSONP (to bypass CORS) or POST.

Logic: Complex business logic (validation, recurrence, emails) lives in the GAS Backend.

2. File Structure

Frontend

index.html: The main entry point. Contains the booking calendar UI and all modals (Booking, Cancel, Choice, Summary, Success).

dashboard.html: The restricted Admin Dashboard. Contains charts (D3.js), summary cards, and data tables.

style.css: Contains custom CSS variables for branding, D3 tooltip styles, and Tailwind utility overrides.

script.js: The core logic for the Booking Calendar. Handles fetching, rendering, and form submissions.

config.js: Stores environment variables (API Keys, Sheet IDs) and Business Rules (ROOM_CONFIG).

.gitignore: Excludes Google Drive shortcut files (*.gdoc, *.gsheet) from Git tracking.

Backend (Google Apps Script)

Code.gs: The server-side code.

doGet(e): Routes requests (create, cancel, fetch_all, export_user_data, delete_user_data).

handleCreateBooking(payload): Main booking logic (Prioritization, Validation, Email).

handleRecurrentBooking(...): Handles looping logic for repeating events.

handleFetchAllBookings(): Returns clean JSON data for the dashboard.

handleExportUserData(): Fetches all bookings associated with a specific email.

handleDeleteUserData(): Anonymizes personal data for a specific email.

3. Key Features & Logic Implementation

A. Booking Prioritization (Waterfall)

Goal: Fill "Main Hall" before using Mezzanine rooms.

Logic Location: Code.gs -> handleCreateBooking

Mechanism: If a User requests a Mezzanine room, the script checks Main Hall capacity. If space exists, it overwrites payload.room to "Main Hall" before saving.

B. Admin vs. User Roles

User: Restricted to 7-day booking window. Must fill Leader details. Strictly capped at MAX_BOOKING_SIZE.

Admin: Can book 6 months out. Can bypass participant limits (up to Room Total). Can book recurrent events. Requires ADMIN_PIN.

Implementation:

Frontend: Toggle switch shows/hides fields and removes HTML max attributes on inputs.

Backend: validateInput function checks the isAdmin flag to relax validation rules.

C. Recurrent Bookings

Logic Location: Code.gs -> handleRecurrentBooking

Mechanism: A loop calculates future dates based on the pattern (Weekly, Monthly, etc.). For "First Wednesday" logic, custom helper functions (findFirstDayOfWeekOfMonth) are used.

Conflict Handling: The script checks availability for each iteration. It books successfully where possible and skips dates with conflicts.

D. Gantt Chart Visualization

Logic Location: dashboard.html -> renderD3GanttChart

Mechanism: Uses D3.js. It calculates "tracks" for overlapping bookings. If Booking B starts before Booking A ends, Booking B is pushed to a new Y-axis row (Track 2). This prevents visual overlapping.

E. GDPR Compliance

Logic Location: index.html (My Bookings Modal) -> Code.gs

Mechanism: Users can request a copy of their data or deletion.
- **Export:** Returns a JSON list of all bookings where the user's email matches.
- **Delete:** Updates the `status` column to "DELETED_USER" and clears PII fields (Name, Email, Phone) in the Google Sheet, preserving statistical data (Room, Time) but removing personal info.

4. Setup & Deployment

Prerequisites

Google Cloud Platform Project (for Sheets API Key).

Google Spreadsheet with specific columns (see below).

GitHub Repository (for hosting).

Google Sheet Schema

The Bookings sheet must have these exact headers in Row 1:
id, date, start_iso, end_iso, first_name, last_name, email, leader_first_name, leader_last_name, event, room, participants, status, created_at, notes

Deployment Steps

Update Config: Edit config.js with your Sheet ID and API Key.

Deploy Backend: In Apps Script editor -> Deploy -> New Deployment -> Web App -> Execute as "Me" -> Access: "Anyone".

Copy URL: Paste the resulting Web App URL into config.js.

Push Frontend: Commit and push changes to GitHub. Ensure GitHub Pages is active.

5. Maintenance & Scaling

Adding Rooms: Add the room name and capacity to ROOM_CONFIG in both config.js and Code.gs.

Changing PIN: Update ADMIN_PIN const in Code.gs.

Rate Limits: Google free tier has email/execution limits. Monitor via Google Cloud Console.