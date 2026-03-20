/**
 * @module api
 * @description JSONP-based API communication layer.
 *
 * All data flows between the frontend and the Google Apps Script backend
 * use JSONP (injecting <script> tags) because the Apps Script Web App
 * only supports GET requests and does not set CORS headers.
 *
 * Exports:
 * - submitRequest  — generic write operation (create, cancel, move, block)
 * - fetchAllBookings — reads all bookings, blocked dates, and settings
 * - fetchUserBookings — reads a single user's future bookings
 * - setRenderCallback / setRenderCalendarButtonsCallback — wiring helpers
 */

import { state } from './state.js';
import { elements, showToast, showToastWithRetry } from './utils/dom.js';
import { isReservationWindowOpen } from './utils/validation.js';

/** @type {Function} Callback invoked after any successful write to re-render the calendar. */
let onRenderCallback = () => { };
/** Registers the callback that re-renders the calendar after data changes. */
export function setRenderCallback(cb) { onRenderCallback = cb; }

/** @type {Function} Callback invoked to render Google Calendar / iCal buttons on success. */
let onRenderCalendarButtons = () => { };
/** Registers the callback that renders calendar export buttons. */
export function setRenderCalendarButtonsCallback(cb) { onRenderCalendarButtons = cb; }

/**
 * Sends a write request (create, cancel, move, block_date) to the
 * Apps Script backend via JSONP.
 *
 * Handles timeout (30 s), success/error UI feedback, loading modal,
 * and an automatic retry mechanism on network failure.
 *
 * On success for 'create', opens the success modal with booking code.
 * On success for other actions, shows a success toast.
 *
 * @param {string} action  - The API action (e.g. 'create', 'cancel', 'move').
 * @param {Object} payload - The request payload to JSON-encode.
 */
export function submitRequest(action, payload) {
    const TIMEOUT_MS = 30000;
    const callbackName = `jsonp_callback_${Date.now()}`;
    const script = document.createElement('script');
    let timeoutId = null;

    const cleanup = () => {
        clearTimeout(timeoutId);
        if (script.parentNode) document.body.removeChild(script);
        delete window[callbackName];
        if (elements.loadingModal) elements.loadingModal.close();
    };

    const retryFn = () => {
        if (elements.loadingModal) elements.loadingModal.showModal();
        submitRequest(action, payload);
    };

    timeoutId = setTimeout(() => {
        cleanup();
        showToastWithRetry(
            'Request timed out. Please check your connection and try again.',
            'error',
            retryFn
        );
    }, TIMEOUT_MS);

    window[callbackName] = (data) => {
        cleanup();
        if (data.success) {
            if (action === 'create') {
                const bookingCode = data.id.substring(0, 12).toUpperCase();
                const bookedRoom = data.bookedRoom;
                const requestedRoom = data.requestedRoom;
                document.getElementById('success-booking-code').textContent = bookingCode;
                document.getElementById('success-room-name').textContent = bookedRoom;

                const startDate = window.luxon.DateTime.fromISO(data.start_iso, { zone: window.APP_CONFIG.TIMEZONE || 'Asia/Manila' });
                const endDate = window.luxon.DateTime.fromISO(data.end_iso, { zone: window.APP_CONFIG.TIMEZONE || 'Asia/Manila' });

                document.getElementById('success-date').textContent = startDate.toFormat('MMMM d, yyyy');
                document.getElementById('success-day').textContent = startDate.toFormat('cccc');
                document.getElementById('success-time').textContent = `${startDate.toFormat('h:mm a')} - ${endDate.toFormat('h:mm a')}`;

                const redirectMsgEl = document.getElementById('success-redirect-message');
                if (data.message.includes('Recurrent')) {
                    redirectMsgEl.textContent = data.message;
                } else if (bookedRoom !== requestedRoom) {
                    redirectMsgEl.innerHTML = `To optimize room usage, your booking for <strong>${requestedRoom}</strong> has been moved to the <strong>${bookedRoom}</strong>.`;
                } else {
                    redirectMsgEl.textContent = `Your booking for ${bookedRoom} is confirmed. Please save this code for your records.`;
                }

                onRenderCalendarButtons({
                    id: data.id,
                    event: data.event || document.getElementById('event').value,
                    room: data.room,
                    start_iso: data.start_iso,
                    end_iso: data.end_iso,
                    notes: document.getElementById('notes')?.value || ''
                });

                if (elements.successModal) elements.successModal.showModal();
            } else {
                showToast(data.message, "success");
            }
            if (elements.bookingModal) elements.bookingModal.close();
            if (elements.cancelModal) elements.cancelModal.close();

            const moveModal = document.getElementById('move-modal');
            if (moveModal) moveModal.close();

            onRenderCallback();
        } else {
            if (action === 'create' && data.message && (data.message.includes('CCF Manila Dleaders List') || data.message.includes('System error'))) {
                // Close all form-related modals to take the user back to the calendar
                if (elements.bookingModal) elements.bookingModal.close();
                if (elements.choiceModal) elements.choiceModal.close();
                if (elements.timeSelectionModal) elements.timeSelectionModal.close();
                if (elements.floorplanModal) elements.floorplanModal.close();

                // Show the specialized denied modal
                if (elements.deniedModal) {
                    const reasonEl = document.getElementById('denied-reason-message');
                    if (reasonEl) reasonEl.textContent = data.message;
                    elements.deniedModal.showModal();
                } else {
                    showToast(data.message.replace(/^Error: /i, ''), "error");
                }
            } else {
                showToast((data.message || "An unknown error occurred.").replace(/^Error: /i, ''), "error");
            }
        }
    };

    script.onerror = () => {
        cleanup();
        showToastWithRetry(
            'Failed to reach the server. Please check your connection and try again.',
            'error',
            retryFn
        );
    };

    const encodedPayload = encodeURIComponent(JSON.stringify(payload));
    script.src = `${window.APP_CONFIG.APPS_SCRIPT_URL}?action=${action}&callback=${callbackName}&payload=${encodedPayload}`;
    document.body.appendChild(script);
}

/**
 * Fetches future confirmed bookings for a specific user email.
 * Used by the "My Bookings" modal. Returns a Promise that
 * resolves with an array of safe (non-PII) booking objects.
 *
 * @param {string} email - The user's email address.
 * @returns {Promise<Array>} Resolves with the user's bookings array.
 */
export async function fetchUserBookings(email) {
    const url = `${window.APP_CONFIG.APPS_SCRIPT_URL}?action=fetch_user_bookings&payload=${encodeURIComponent(JSON.stringify({ email: email }))}`;

    return new Promise((resolve, reject) => {
        const callbackName = `my_bookings_callback_${Date.now()}`;
        const script = document.createElement('script');

        window[callbackName] = (response) => {
            delete window[callbackName];
            document.body.removeChild(script);
            if (response.success) {
                resolve(response.bookings);
            } else {
                reject(new Error(response.message || "Failed to fetch bookings"));
            }
        };

        script.src = `${url}&callback=${callbackName}`;
        script.onerror = () => {
            reject(new Error("Network connection failed"));
        };
        document.body.appendChild(script);
    });
}

/**
 * Fetches all confirmed bookings, blocked dates, and global settings
 * (e.g. announcement banner) from the backend.
 *
 * Normalizes the response data, updates `state.allBookings` and
 * `state.blockedDates`, manages the announcement banner visibility,
 * and starts the data freshness indicator.
 *
 * @param {Function} updateFreshnessDisplay - Callback to update the
 *   "last refreshed" timestamp in the UI.
 * @returns {Promise<void>}
 */
export async function fetchAllBookings(updateFreshnessDisplay) {
    const url = `${window.APP_CONFIG.APPS_SCRIPT_URL}?action=fetch_all`;

    return new Promise((resolve, reject) => {
        const callbackName = `fetch_all_callback_${Date.now()}`;
        const script = document.createElement('script');
        let timeoutId = null;

        const cleanup = () => {
            clearTimeout(timeoutId);
            if (script.parentNode) document.body.removeChild(script);
            delete window[callbackName];
        };

        timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("Request timed out. Please check your internet connection or the configuration."));
        }, 30000);

        window[callbackName] = (response) => {
            cleanup();
            if (response.success) {
                state.allBookings = (response.data || []).map(b => ({
                    ...b,
                    participants: (b.participants !== undefined) ? b.participants : b.pax,
                    first_name: b.first_name || (b.name ? b.name.split(' ')[0] : 'Unknown'),
                    last_name: b.last_name || (b.name ? b.name.split(' ').slice(1).join(' ') : ''),
                    start_iso: b.start_iso,
                    end_iso: b.end_iso
                }));

                state.blockedDates = (response.blocked_dates || []).map(d => ({
                    date: d.date,
                    room: d.room,
                    reason: d.reason
                }));

                // Store reservation window settings
                if (response.reservation_window) {
                    // Ensure time values are strings (Sheets may return Date objects)
                    const rw = response.reservation_window;
                    if (rw.openTime) rw.openTime = String(rw.openTime);
                    if (rw.closeTime) rw.closeTime = String(rw.closeTime);
                    state.reservationWindow = rw;
                }

                // Update reservation window banner
                const windowBanner = document.getElementById('reservation-window-banner');
                if (windowBanner && state.reservationWindow) {
                    const rwStatus = isReservationWindowOpen();

                    if (rwStatus.isOpen) {
                        windowBanner.className = 'bg-emerald-50 border-l-4 border-emerald-500 p-3 mb-4 rounded-r-lg';
                        windowBanner.innerHTML = `
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                <span class="text-sm font-medium text-emerald-800">
                                    ${rwStatus.message.replace('open until', '<strong>open</strong> until')}
                                </span>
                            </div>`;
                        windowBanner.classList.remove('hidden');
                    } else if (!state.isAdmin) {
                        windowBanner.className = 'bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded-r-lg';
                        windowBanner.innerHTML = `
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                                </svg>
                                <span class="text-sm font-medium text-amber-800">
                                    ${rwStatus.message.replace('closed.', '<strong>closed</strong>.')}
                                </span>
                            </div>`;
                        windowBanner.classList.remove('hidden');
                    } else {
                        // Admin sees a subtle indicator
                        windowBanner.className = 'bg-blue-50 border-l-4 border-blue-400 p-3 mb-4 rounded-r-lg';
                        windowBanner.innerHTML = `
                            <div class="flex items-center gap-2">
                                <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                <span class="text-sm font-medium text-blue-700">
                                    <strong>Admin Mode</strong> — Reservation window is closed for users. Next opening: ${DAY_NAMES[rw.openDay]} ${rw.openTime.replace(/^0/, '')}
                                </span>
                            </div>`;
                        windowBanner.classList.remove('hidden');
                    }
                }

                if (response.announcement && response.announcement.isActive) {
                    const banner = document.getElementById('announcement-banner');
                    const text = document.getElementById('announcement-text');
                    if (banner && text) {
                        text.textContent = response.announcement.message;
                        banner.classList.remove('hidden');

                        const closeBtn = document.getElementById('announcement-close');
                        if (closeBtn) {
                            closeBtn.onclick = () => {
                                banner.classList.add('hidden');
                            };
                        }
                    }
                } else {
                    const banner = document.getElementById('announcement-banner');
                    if (banner) banner.classList.add('hidden');
                }

                state.lastFetchTimestamp = Date.now();
                const freshnessBar = document.getElementById('data-freshness-bar');
                if (freshnessBar) freshnessBar.classList.remove('hidden');

                if (updateFreshnessDisplay) updateFreshnessDisplay();

                resolve();
            } else {
                reject(new Error(response.message || "Failed to fetch bookings"));
            }
        };

        script.src = `${url}&callback=${callbackName}`;
        script.onerror = () => {
            cleanup();
            reject(new Error("Network connection failed."));
        };
        document.body.appendChild(script);
    });
}
