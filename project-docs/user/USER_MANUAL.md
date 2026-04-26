# CCF Manila Room Reservation System — User Manual

> **Version:** 2.0  
> 💡 **Visual Guide Available:** Prefer a visual walkthrough? View the [User Guide Presentation](https://docs.google.com/presentation/d/1oNwuIu89BxDH1aAoz8RPQeR73xltX3wS6vVrT3Pdvnc/edit?slide=id.g3bf48505da8_0_25#slide=id.g3bf48505da8_0_25).

---

## Table of Contents
- [Getting Started](#getting-started)
- [For Regular Users](#for-regular-users)
  - [Booking a Room](#booking-a-room)
  - [Cancelling a Booking](#cancelling-a-booking)
  - [Cancelling via Email Link](#cancelling-via-email-link)
  - [My Bookings Portal](#my-bookings-portal)
  - [Data Privacy (GDPR)](#data-privacy-gdpr)
- [For Administrators](#for-administrators)
  - [Accessing Admin Mode](#accessing-admin-mode)
  - [Making an Admin Booking](#making-an-admin-booking)
  - [Moving/Rescheduling a Booking](#movingrescheduling-a-booking)
  - [Admin Cancellation](#admin-cancellation)
  - [Blocking Dates](#blocking-dates)
  - [Managing Announcements](#managing-announcements)
  - [Reservation Window Settings](#reservation-window-settings)
  - [Admin Dashboard](#admin-dashboard)
- [Understanding the Calendar](#understanding-the-calendar)
- [Available Rooms](#available-rooms)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

When you first open the reservation system, a **Welcome Modal** will appear asking you to choose your role:

- **Continue as User** — Standard booking with validation checks.
- **Continue as Admin** — Enter the Admin PIN to unlock advanced features.

> **Note:** The system has a **Reservation Window** — bookings may only be placed during specific days and times (e.g., Sunday 8:00 AM – Monday 8:00 PM). If the window is closed, you will see a banner indicating when it reopens.

---

## For Regular Users

### Booking a Room

1. **Select Room:** Choose your desired room from the dropdown menu at the top (Main Hall, Jonah, Joseph, or Moses). The capacity badge shows how many groups can book simultaneously.

2. **Navigate to Date:** Use the **← Prev** and **Next →** buttons to find your desired week.

3. **Select Time Slot:** Click on an available time slot. If the slot shows "Available," you'll proceed directly. If it shows "X spots left," you can still book if there's capacity.

4. **Choose End Time:** A modal appears with a dropdown to select your **End Time** in 30-minute increments. The total duration (e.g., "1.5 hrs") is displayed. Click **Continue to Booking**.

5. **Fill the Booking Form:**
   - First and Last Name
   - Email Address (with confirmation field — the system warns about common typos like "gmial.com")
   - Event Type
   - Group Size

6. **Accept Terms:** Check both the Housekeeping Rules and Privacy Policy checkboxes.

7. **Review & Confirm:** Click "Confirm Booking" to see a summary modal. Review the details and click **"Yes, Confirm"**.

8. **Done!** You'll see a success message with your **Booking Code**. You'll also receive a confirmation email with:
   - Booking details
   - A direct link to **Add to Google Calendar**
   - A one-click **Cancel Booking** link

> **Room Optimization:** If you book a Mezzanine room (Jonah, Joseph, or Moses) but the Main Hall has availability during your time slot, the system may automatically move your booking to the Main Hall to optimize space. You'll be prompted to select a table from the interactive floorplan. Your email will confirm which room you were assigned.

---

### Cancelling a Booking

1. Find the time slot of your booking on the calendar.
2. Click on the booked slot.
3. Select **"Cancel a Booking"** from the choice modal.
4. Choose your booking from the list.
5. Enter your **Booking Code** (the first 8 characters from your confirmation email).
6. Click the red **"Confirm Cancellation"** button.

---

### Cancelling via Email Link

Your confirmation email contains a direct cancellation link. Simply:

1. Open your confirmation email.
2. Click the **"Cancel This Booking"** link.
3. The app will open with a cancellation modal already showing your booking details.
4. Click **"Yes, Cancel"** to confirm.

> This bypasses the need to log in or find your booking on the calendar.

---

### My Bookings Portal

To view all your upcoming bookings:

1. Click the **"My Bookings"** button in the header.
2. Enter your email address.
3. View your list of future confirmed bookings.
4. From here, you can cancel any booking or access your GDPR data rights.

---

### Data Privacy (GDPR)

The system provides two data rights accessible from the My Bookings portal:

- **Export My Data:** Download a complete record of all your bookings. Requires your Booking Code for identity verification.
- **Delete My Data:** Permanently anonymize all your personal data across all bookings. Future confirmed bookings will be automatically cancelled. You'll receive a confirmation email summarizing what was deleted.

> Your data is automatically anonymized after 5 years as part of the system's data retention policy.

---

## For Administrators

### Accessing Admin Mode

1. On the Welcome Modal, click **"Continue as Admin"**.
2. Enter the secure **Admin PIN**.
3. Click **"Login"**.

Once authenticated, you'll see admin-exclusive features throughout the interface.

---

### Making an Admin Booking

Admin bookings have extended capabilities:

| Feature | User | Admin |
|---------|------|-------|
| Advance booking | Up to 6 months | Up to 6 months |
| Max group size | Room-specific cap | Up to room total capacity |
| Recurrence | Not available | Weekly, Monthly, Quarterly, etc. |
| DLeaders validation | Required | Bypassed |
| Reservation window | Enforced | Bypassed |
| Ministry Event types | Standard events only | Full access (auto-fills room capacity) |

**Recurrence Options:**
- **Weekly** — Repeats every week for 12 weeks.
- **Monthly** — Repeats same date each month for 6 months.
- **Quarterly** — Repeats every 3 months for 4 occurrences.
- **First Wednesday** — First Wednesday of each month for 6 months.
- **Last Saturday** — Last Saturday of each month for 6 months.

Dates that conflict with existing bookings or blocked dates are automatically skipped.

---

### Moving/Rescheduling a Booking

*Admin only.* To reschedule an existing booking:

1. Click on the booked time slot.
2. Select **"Move / Reschedule"** from the choice modal.
3. Select the booking you want to move.
4. Choose the new **Date**, **Start Time**, **End Time**, and **Room**.
5. If there's a scheduling conflict, the system will warn you. You can choose to proceed with a double-booking or go back.
6. Review the move summary and click **"Confirm Move"**.
7. Provide a **Reason** for the move (this is appended to the booking notes).

The original booker will receive an email notification about the reschedule.

---

### Admin Cancellation

Admins can cancel **any** booking without the user's booking code:

1. Click on the booked time slot.
2. Select **"Cancel a Booking"**.
3. Choose the booking to cancel.
4. Enter the **Admin PIN** in the PIN field (this overrides the booking code requirement).
5. Click **"Confirm Cancellation"**.

For **recurrent bookings**, admins can choose to cancel the entire series at once.

---

### Blocking Dates

To close rooms for holidays, maintenance, or special events:

1. Open the **Admin Dashboard**.
2. Navigate to the **Blocked Dates** section.
3. Select the **Date** to block.
4. Select **Rooms** — you can check multiple rooms at once, or select "All Rooms".
5. *(Optional)* Set **Start Time** and **End Time** for a partial-day block. Leave blank for a full-day block.
6. Enter a **Reason** (e.g., "Holiday - Labor Day").
7. Click **"Block Date"**.

**What happens automatically:**
- All existing confirmed bookings that overlap with the blocked date/time/room are **automatically cancelled**.
- Affected users receive an email notification explaining why their booking was cancelled.
- The blocked date appears in the calendar as a "Closed" slot.

To **remove** a blocked date, click the delete button (🗑) next to the entry in the blocked dates table.

---

### Managing Announcements

To display a site-wide banner message:

1. Open the **Admin Dashboard**.
2. Go to **Announcement Settings**.
3. Enter your **Announcement Message**.
4. Toggle **Active** on.
5. *(Optional)* Set **Start Date** and **End Date** to auto-show/hide the banner during a specific period.
6. Click **"Save Announcement"**.

The banner appears at the top of the booking page for all users.

---

### Reservation Window Settings

Control when regular users can make bookings:

1. Open the **Admin Dashboard**.
2. Go to **Reservation Window** settings.
3. Set the **Open Day/Time** (e.g., Sunday 08:00).
4. Set the **Close Day/Time** (e.g., Monday 20:00).
5. Click **"Save"**.

When the window is closed, non-admin users see a banner with the next opening time and cannot submit bookings. Admins can always book regardless of the window.

---

### Admin Dashboard

Access the dashboard from the header's **"Admin Dashboard"** button.

| Feature | Description |
|---------|-------------|
| **Summary Cards** | Total bookings, total participants, room utilization |
| **Weekly Admin Horizon** | Scrollable cards showing admin/church events for the next 7 days |
| **Room Usage Charts** | D3.js donut charts breaking down bookings by room and event type |
| **Gantt Timeline** | Visual timeline showing when rooms are occupied (hover for details) |
| **Room Tables** | Detailed booking lists, filterable by room and date |
| **Blocked Dates** | Manage blocked dates with add/delete actions |
| **Announcement Settings** | Configure the global banner |
| **Reservation Window** | Configure booking window schedule |
| **Search** | Filter bookings by name, email, or date |

---

## Understanding the Calendar

### Slot Color Codes

| Color | Meaning |
|-------|---------|
| **White** | Available — no bookings in this slot |
| **Yellow** | Partially booked — room has capacity for more groups ("X spots left") |
| **Red** | Full — room is at maximum capacity or blocked by a full-room event |
| **Gray (light)** | Past — slot has already passed |
| **Gray (dark)** | Closed / Blocked — room is blocked by admin or outside business hours |

### Calendar Layout

- **Sticky Headers** — Day/date headers stay visible as you scroll.
- **AM/PM Sidebar** — A 50px sidebar on the left marks the AM and PM sections with a thick divider.
- **Time Labels** — Simplified `h:mm` format (12:00, 12:30, 1:00...) for clean scanning.
- **Data Freshness Bar** — Shows when data was last refreshed. Click it to manually refresh.

---

## Available Rooms

| Room | Max Participants | Max Groups | Min Group Size | Max Group Size |
|------|-----------------|------------|----------------|----------------|
| **Main Hall** | 55 | 6 | 2 | 25 |
| **Jonah** | 20 | 2 | 2 | 10 |
| **Joseph** | 15 | 1 | 2 | 15 |
| **Moses** | 15 | 1 | 2 | 15 |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Reservation window is closed" | Check the banner for the next opening time. Contact your admin if urgent. |
| "Your reservation was denied" | Your name was not found in the CCF Manila DLeaders list. Contact your DGroup Leader. |
| "This slot was just filled" | Another user booked the same slot. Choose a different time. |
| Can't find my booking to cancel | Use the **"My Bookings"** portal or the cancellation link in your confirmation email. |
| No confirmation email received | Check your spam/junk folder. Verify you entered the correct email address. |
| Booking moved to Main Hall | The system's room optimization (Squeeze Logic) found available capacity in the Main Hall and auto-upgraded your booking. |
