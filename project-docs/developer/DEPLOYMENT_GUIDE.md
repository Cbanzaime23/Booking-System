# CCF Manila Room Reservation System — Deployment Guide

> **Version:** 2.0  
> Complete setup, configuration, and deployment instructions for new environments.

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Google Sheet Setup](#google-sheet-setup)
- [Backend Deployment (Google Apps Script)](#backend-deployment-google-apps-script)
- [Frontend Configuration](#frontend-configuration)
- [Frontend Deployment (GitHub Pages)](#frontend-deployment-github-pages)
- [DLeaders Validation Sheet Setup](#dleaders-validation-sheet-setup)
- [Post-Deployment Verification](#post-deployment-verification)
- [Testing Setup](#testing-setup)
- [Maintenance & Operations](#maintenance--operations)

---

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| Google Account | For Google Sheets, Apps Script, and MailApp |
| Google Spreadsheet | Database for bookings, blocked dates, settings, and logs |
| GitHub Account | For hosting the frontend via GitHub Pages |
| Node.js 18+ | For running Playwright end-to-end tests (optional) |

---

## Google Sheet Setup

Create a new Google Spreadsheet and add the following sheets:

### 1. `Bookings` Sheet

Add these **exact** column headers in Row 1:

```
id | date | start_iso | end_iso | first_name | last_name | email | leader_first_name | leader_last_name | event | room | participants | status | created_at | notes | terms_accepted | privacy_accepted | consent_timestamp | recurrence_id | table_id | is_admin_booking
```

> **Note:** The `leader_first_name` and `leader_last_name` columns are deprecated but kept for backward compatibility. The `recurrence_id`, `table_id`, and `is_admin_booking` columns are auto-created by the backend if missing.

### 2. `BlockedDates` Sheet

Add these headers in Row 1:

```
Date | Room | Reason | Start Time | End Time
```

### 3. `Settings` Sheet

This sheet uses key-value pairs. Add the header row:

```
Setting Name | Setting Value
```

Then add these initial rows:

| Setting Name | Setting Value |
|---|---|
| Announcement Message | *(empty)* |
| Announcement Active | FALSE |
| Announcement Start | *(empty)* |
| Announcement End | *(empty)* |
| Reservation Window Open Day | 0 |
| Reservation Window Open Time | 08:00 |
| Reservation Window Close Day | 1 |
| Reservation Window Close Time | 20:00 |

### 4. `Logs` Sheet

This is auto-created on first logged action. If you want to pre-create it:

```
Timestamp | Action | Booking ID | Admin PIN | Details
```

---

## Backend Deployment (Google Apps Script)

### Step 1: Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com).
2. Create a new project.
3. Create these 9 files (matching the contents in `appscript/`):
   - `Config.gs`
   - `Controllers.gs`
   - `BookingService.gs`
   - `Database.gs`
   - `EmailService.gs`
   - `GdprService.gs`
   - `Retention.gs`
   - `Utils.gs`
   - `Validation.gs`

> **Important:** In Google Apps Script, the file extension is `.gs`, not `.js`. All files share the same global scope.

### Step 2: Update Configuration

In `Config.gs`, update these constants:

```javascript
const SPREADSHEET_ID = 'your-google-spreadsheet-id';
const ADMIN_PIN = 'your-secure-admin-pin';
const DLEADERS_SPREADSHEET_ID = 'your-dleaders-spreadsheet-id';
const SURVEY_FORM_URL = 'your-survey-form-url';
```

### Step 3: Deploy as Web App

1. In the Apps Script editor: **Deploy → New Deployment**.
2. **Select type:** Web App.
3. **Execute as:** "Me" (your Google account).
4. **Who has access:** "Anyone" (so the frontend can call it).
5. Click **Deploy**.
6. **Copy the Web App URL** — you'll need it for the frontend.

### Step 4: Set Up Triggers (Optional)

For auto-retention of old booking data:

1. In the Apps Script editor: **Triggers → Add Trigger**.
2. **Function:** `anonymizeExpiredBookings`
3. **Event source:** Time-driven
4. **Type:** Day timer
5. **Time of day:** 1:00 AM – 2:00 AM

---

## Frontend Configuration

Edit `config.js` in the project root:

```javascript
window.APP_CONFIG = {
  // REQUIRED: Your Apps Script Web App URL
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',

  // REQUIRED: Public URL where the app is hosted (for email deep-links)
  PUBLIC_APP_URL: 'https://your-username.github.io/Booking-System/index.html',

  // Timezone (IANA format)
  TIMEZONE: 'Asia/Manila',

  // Time slot granularity
  SLOT_DURATION_MINUTES: 30,

  // Operating hours per day of week (0=Sun, 6=Sat)
  BUSINESS_HOURS: {
    0: { start: '10:00', end: '22:00' },
    1: { start: '10:00', end: '22:00' },
    // ... set null for closed days: { start: null }
  },

  // Room capacity and group limits
  ROOM_CONFIG: {
    "Main Hall": {
      MAX_TOTAL_PARTICIPANTS: 55,
      MAX_CONCURRENT_GROUPS: 6,
      MIN_BOOKING_SIZE: 2,
      MAX_BOOKING_SIZE: 25
    },
    // ... add more rooms as needed
  },

  // Default reservation window (overridden by admin settings)
  RESERVATION_WINDOW: {
    OPEN_DAY: 0,
    OPEN_TIME: '08:00',
    CLOSE_DAY: 1,
    CLOSE_TIME: '20:00'
  }
};
```

---

## Frontend Deployment (GitHub Pages)

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Deploy v2.0"
git push origin main
```

### Step 2: Enable GitHub Pages

1. Go to **Repository Settings → Pages**.
2. **Source:** Deploy from a branch.
3. **Branch:** `main` / `root`.
4. Click **Save**.

The site will be available at:
```
https://<username>.github.io/<repo-name>/
```

### Step 3: Verify HTTPS

The app includes an automatic HTTP → HTTPS redirect in `index.html`. Ensure your GitHub Pages deployment uses HTTPS (enabled by default).

---

## DLeaders Validation Sheet Setup

The system validates user names against an external Google Sheet containing approved DLeaders.

### Sheet Structure

Create a Google Spreadsheet with monthly tabs (e.g., "January", "February", ..., "December"). Each tab must have these columns:

```
first_name | last_name | nick_name
```

The system automatically selects the **latest month's tab** based on chronological order.

### Configuration

Set the spreadsheet ID in `Config.gs`:
```javascript
const DLEADERS_SPREADSHEET_ID = 'your-dleaders-spreadsheet-id';
```

> **Caching:** The DLeaders list is cached for 5 minutes via `CacheService` to avoid hitting API quotas.

---

## Post-Deployment Verification

### Checklist

- [ ] Open the app URL and verify the Role Selection Modal appears
- [ ] Enter admin PIN and verify admin mode activates
- [ ] Create a test booking and verify:
  - [ ] Booking appears in Google Sheet
  - [ ] Confirmation email is received
  - [ ] Email contains cancellation deep-link
  - [ ] Calendar link works
- [ ] Cancel the test booking via email deep-link
- [ ] Verify the Admin Dashboard loads with charts
- [ ] Test blocked dates feature (block and verify auto-cancellation)
- [ ] Test announcement banner toggle
- [ ] Verify reservation window enforcement

---

## Testing Setup

### End-to-End Tests (Playwright)

The project includes Playwright-based e2e tests in the `tests/` directory.

#### Install Dependencies

```bash
cd tests
pip install -r requirements.txt
playwright install
```

#### `requirements.txt` Contents

```
playwright
pytest
pytest-html
```

#### Run Tests

```bash
# Windows
run_tests.bat

# Or directly
pytest tests/ --html=tests/report.html --self-contained-html
```

#### Test Files

| File | Description |
|------|-------------|
| `conftest.py` | Shared fixtures and page setup |
| `test_user_journey.py` | Full user booking flow |
| `test_admin_journey.py` | Admin authentication and features |
| `test_e2e_reservation.py` | End-to-end reservation lifecycle |

---

## Maintenance & Operations

### Adding Rooms

1. Add the room name and capacity to `ROOM_CONFIG` in **both**:
   - `config.js` (frontend)
   - `Config.gs` (backend)
2. Redeploy the Apps Script Web App.
3. Commit and push the frontend.

### Changing the Admin PIN

1. Update `ADMIN_PIN` in `Config.gs`.
2. Redeploy the Apps Script Web App.

### Monitoring Rate Limits

Google free-tier limits:
- **Email:** 100 emails/day for consumer accounts, 1,500/day for Workspace.
- **Execution time:** 6 minutes per script execution.
- **URL Fetch:** 20,000 calls/day.

Monitor usage via the [Google Cloud Console](https://console.cloud.google.com/).

### Cache Management

The DLeaders validation list is cached for 5 minutes. To force a refresh:
1. Open the Apps Script editor.
2. Run: `CacheService.getScriptCache().remove("DLEADERS_LIST")`

### Data Retention

The `anonymizeExpiredBookings` trigger (if configured) runs daily and anonymizes bookings older than 1,825 days (5 years). Adjust `RETENTION_DAYS` in `Config.gs` to change this.
