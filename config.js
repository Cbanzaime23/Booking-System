
// Rename this file to config.js and fill in your details.
window.APP_CONFIG = {
  /**
   * SECURITY: SPREADSHEET_ID and API_KEY have been removed from the frontend.
   * All data access now routes exclusively through the Apps Script gateway below.
   * This prevents unauthorized direct access to the Google Sheet.
   */

  /**
   * The URL of your deployed Google Apps Script Web App.
   * This is the ONLY gateway to your data — all reads and writes go through here.
   */
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxteYrG9CsyoabdIKBG-vBaiLfR4Zo401XKhnXQSnp2Z4C3fQmjIZV07Kr9ezPZ6JHB/exec',

  // --- Optional Configurations ---

  /**
   * The primary timezone for the business. Bookings will be displayed in the user's local time,
   * but this helps anchor the business hours. Uses IANA timezone names.  
   * Example: 'America/New_York', 'Europe/London', 'Asia/Manila'
   */
  TIMEZONE: 'Asia/Manila',

  /**
   * The smallest time unit for bookings, in minutes.
   * E.g., 15 for 15-minute slots, 30 for 30-minute slots.
   */
  SLOT_DURATION_MINUTES: 30,

  /**
   * Define the operating hours for the booking system in 24-hour format.
   * Bookings cannot be made outside these hours.
   */
  BUSINESS_HOURS: {
    // Weekday indices: 0=Sunday, 1=Monday, ..., 6=Saturday
    // Use 'start: null' to mark a day as closed.
    0: { start: '10:00', end: '22:00' }, // Sunday
    1: { start: '10:00', end: '22:00' }, // Monday
    2: { start: '10:00', end: '22:00' }, // Tuesday
    3: { start: '10:00', end: '22:00' }, // Wednesday
    4: { start: '10:00', end: '22:00' }, // Thursday
    5: { start: '10:00', end: '22:00' }, // Friday
    6: { start: '10:00', end: '22:00' }, // Saturday
  },
  /**
 * NEW: Configuration for all available rooms.
 * This drives the UI and all validation logic.
 * Based on your image:
 * - Main Hall: 30 total, 5 groups, max 25 per group. (Min 2)
 * - Mezzanine A: 20 total, 2 groups, max 10 per group. (Min 2)
 * - Mezzanine B: 15 total, 1 group, max 1 per group. (Min 1)
 * - Mezzanine C: 15 total, 1 group, max 1 per group. (Min 1)
 */
  ROOM_CONFIG: {
    "Main Hall": {
      MAX_TOTAL_PARTICIPANTS: 55,
      MAX_CONCURRENT_GROUPS: 6,
      MIN_BOOKING_SIZE: 2,
      MAX_BOOKING_SIZE: 25
    },
    "Jonah": {
      MAX_TOTAL_PARTICIPANTS: 20,
      MAX_CONCURRENT_GROUPS: 2,
      MIN_BOOKING_SIZE: 2,
      MAX_BOOKING_SIZE: 10
    },
    "Joseph": {
      MAX_TOTAL_PARTICIPANTS: 15,
      MAX_CONCURRENT_GROUPS: 1,
      MIN_BOOKING_SIZE: 2,
      MAX_BOOKING_SIZE: 15
    },
    "Moses": {
      MAX_TOTAL_PARTICIPANTS: 15,
      MAX_CONCURRENT_GROUPS: 1,
      MIN_BOOKING_SIZE: 2,
      MAX_BOOKING_SIZE: 15
    }
  }
};