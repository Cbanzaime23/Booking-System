
// Rename this file to config.js and fill in your details.
window.APP_CONFIG = {
    /**
     * The ID of your Google Sheet.
     * Found in the URL of your sheet: https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
     */
    SPREADSHEET_ID: '13SROZHNchpiGKpgSc6bpxbuf2Fhw0AMIAcQyC48BKkM',
  
    /**
     * Your Google Sheets API Key for read-only access.
     * Make sure to restrict this key to your website's domain in the Google Cloud Console.
     */
    API_KEY: 'AIzaSyBWeYEPI6xBe-J4U2j7UE3hedOqcUXcU0I',
  
    /**
     * The URL of your deployed Google Apps Script Web App for writing bookings.
     */
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxGvcb6sxM84PCuBCajmnvfkA77O18jr7Za3P1vDs_FoM2cI39540SR6YlYA0G9Kgni/exec',
  
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
      0: { start: null, end: null }, // Sunday
      1: { start: '09:00', end: '17:00' }, // Monday
      2: { start: '09:00', end: '17:00' }, // Tuesday
      3: { start: '09:00', end: '17:00' }, // Wednesday
      4: { start: '09:00', end: '17:00' }, // Thursday
      5: { start: '09:00', end: '17:00' }, // Friday
      6: { start: '10:00', end: '14:00' }, // Saturday
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
        MAX_TOTAL_PARTICIPANTS: 30,
        MAX_CONCURRENT_GROUPS: 5,
        MIN_BOOKING_SIZE: 2,
        MAX_BOOKING_SIZE: 25
      },
      "Mezzanine A": {
        MAX_TOTAL_PARTICIPANTS: 20,
        MAX_CONCURRENT_GROUPS: 2,
        MIN_BOOKING_SIZE: 2,
        MAX_BOOKING_SIZE: 10
      },
      "Mezzanine B": {
        MAX_TOTAL_PARTICIPANTS: 15,
        MAX_CONCURRENT_GROUPS: 1,
        MIN_BOOKING_SIZE: 2,
        MAX_BOOKING_SIZE: 15
      },
      "Mezzanine C": {
        MAX_TOTAL_PARTICIPANTS: 15,
        MAX_CONCURRENT_GROUPS: 1,
        MIN_BOOKING_SIZE: 2,
        MAX_BOOKING_SIZE: 15
      }
  }
  };