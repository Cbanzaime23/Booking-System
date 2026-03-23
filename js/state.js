/**
 * @module state
 * @description Central application state store and configuration constants.
 *
 * This module holds the single source of truth for the booking system's
 * runtime state (current date, loaded bookings, selected room, pending
 * operations) and static lookup data (room capacities, event options).
 *
 * State is mutated in-place by other modules — there is no framework;
 * callers read/write properties directly and trigger re-renders manually.
 */

const DateTime = window.luxon.DateTime;

/**
 * Global mutable application state.
 * @type {Object}
 * @property {DateTime|null}  currentDate          - The Monday of the currently displayed week.
 * @property {Array}          allBookings          - All confirmed bookings fetched from the server.
 * @property {string|null}    selectedRoom         - The room name currently shown in the calendar.
 * @property {boolean}        isLoading            - Whether a network request is in progress.
 * @property {Object|null}    selectedSlot         - The calendar slot the user last clicked.
 * @property {Object|null}    pendingBookingData   - Booking payload awaiting confirmation.
 * @property {Object|null}    pendingMoveData      - Move payload awaiting confirmation.
 * @property {number|null}    lastFetchTimestamp   - Unix ms timestamp of the last successful data fetch.
 * @property {Object|null}    duplicationSource    - Source booking for the duplication flow.
 * @property {number|null}    duplicationDuration  - Duration (hours) to carry over when duplicating.
 * @property {Object|null}    pendingCancelData    - Cancellation payload awaiting series confirmation.
 * @property {Array}          blockedDates         - Dates marked as unavailable by an admin.
 */
export const state = {
    currentDate: null,
    allBookings: [],
    selectedRoom: null,
    isLoading: false,
    selectedSlot: null,
    pendingBookingData: null,
    pendingMoveData: null,
    lastFetchTimestamp: null,
    duplicationSource: null,
    duplicationDuration: null,
    pendingCancelData: null,
    blockedDates: [],
    reservationWindow: null,
    isAdmin: false,
    isAutoUpgradeTableSelect: false
};

/**
 * Maximum total participants each room can hold at any one time.
 * Used by validation logic to enforce hard capacity limits.
 * @type {Object.<string, number>}
 */
export const ROOM_CAPACITIES = {
    "Main Hall": 55,
    "Jonah": 20,
    "Joseph": 15,
    "Moses": 15,
};

/**
 * Pre-defined event type options shown in the booking form dropdown.
 *
 * - USER:             Always visible to all users.
 * - ADMIN_ADDITIONS:  Only shown when the user is logged in as admin.
 *   Events with `setsMaxCapacity: true` auto-fill the participant field
 *   to the room's maximum when selected (e.g. Sunday Service = full room).
 *
 * @type {{ USER: Array, ADMIN_ADDITIONS: Array }}
 */
export const EVENT_OPTIONS = {
    USER: [
        { name: "Discipleship Group Meeting", setsMaxCapacity: false },
        { name: "Ministry Event - Meeting", setsMaxCapacity: false }
    ],
    ADMIN_ADDITIONS: [
        { name: "Ministry Event - B1G Fridays", setsMaxCapacity: true },
        { name: "Ministry Event - Elevate", setsMaxCapacity: true },
        { name: "Ministry Event - Exalt Rehearsal", setsMaxCapacity: true },
        { name: "Ministry Event - Intercede Prayer Ministry", setsMaxCapacity: true },
        { name: "Ministry Event - Women 2 Women", setsMaxCapacity: true },
        { name: "Ministry Event - MOVEMENT", setsMaxCapacity: true },
        { name: "Ministry Event - ACROSS Family Ministry", setsMaxCapacity: true },
        { name: "Ministry Event - NXTGEN", setsMaxCapacity: true },
        { name: "Sunday Service", setsMaxCapacity: true }
    ]
};

/**
 * Initializes the application state from APP_CONFIG.
 * Sets the current date to today (in the configured timezone) and
 * selects the first room from ROOM_CONFIG as the default.
 * Must be called after `config.js` has loaded.
 */
export function initState() {
    if (window.APP_CONFIG) {
        state.currentDate = DateTime.local().setZone(window.APP_CONFIG.TIMEZONE);
        state.selectedRoom = Object.keys(window.APP_CONFIG.ROOM_CONFIG)[0];
    }
}
