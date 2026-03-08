/**
 * @module admin
 * @description Admin authentication and admin-specific UI helpers.
 *
 * Provides the admin login modal flow and the event dropdown renderer
 * that conditionally shows admin-only event types based on recurrence.
 */

import { EVENT_OPTIONS } from './state.js';
import { elements, showToast } from './utils/dom.js';

/**
 * Opens the admin login modal dialog and focuses the PIN input field.
 * Resets any previously entered values before showing.
 */
export function openAdminLoginModal() {
    const modal = document.getElementById('admin-login-modal');
    const form = document.getElementById('admin-login-form');
    const pinInput = document.getElementById('admin-login-pin');

    if (modal && form) {
        form.reset();
        modal.showModal();
        if (pinInput) pinInput.focus();
    }
}

/**
 * Handles the admin login form submission.
 * Validates the entered PIN against the hardcoded admin PIN and,
 * on success, stores the session flag and redirects to the dashboard.
 *
 * @param {SubmitEvent} e - The form submit event.
 */
export function handleAdminLoginSubmit(e) {
    e.preventDefault();
    const pinInput = document.getElementById('admin-login-pin');
    const input = pinInput.value;
    const ADMIN_PIN = "CCFManila@2025";

    if (input === ADMIN_PIN) {
        sessionStorage.setItem('ccf_admin_logged_in', 'true');
        window.location.href = 'dashboard.html';
    } else {
        showToast("Incorrect PIN. Access Denied.", "error");
        pinInput.value = '';
        pinInput.focus();
    }
}

/**
 * Populates the event type dropdown in the booking form.
 *
 * - Regular users see only the USER event options.
 * - Admin users see USER + ADMIN_ADDITIONS events, filtered by
 *   the currently selected recurrence pattern (first_wednesday
 *   and last_saturday restrict which admin events are available).
 *
 * Events with `setsMaxCapacity: true` will auto-fill the participant
 * field to the room's maximum capacity when selected (handled
 * elsewhere in the booking form logic).
 *
 * @param {boolean} isAdmin - Whether the current session is admin-authenticated.
 */
export function renderEventDropdown(isAdmin) {
    const eventSelector = elements.bookingForm.querySelector('#event');
    const recurrenceSelector = elements.bookingForm.querySelector('#recurrence');

    if (!eventSelector) return;

    const recurrenceValue = recurrenceSelector ? recurrenceSelector.value : 'none';
    eventSelector.innerHTML = '';

    // Placeholder option
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select an event type...';
    placeholder.disabled = true;
    placeholder.selected = true;
    eventSelector.appendChild(placeholder);

    const allOptions = [...EVENT_OPTIONS.USER];

    if (isAdmin) {
        let adminOptions = [...EVENT_OPTIONS.ADMIN_ADDITIONS];

        // Filter admin options based on recurrence pattern
        if (recurrenceValue === 'first_wednesday') {
            adminOptions = adminOptions.filter(opt =>
                opt.name === "Ministry Event - Intercede Prayer Ministry"
            );
        } else if (recurrenceValue === 'last_saturday') {
            adminOptions = adminOptions.filter(opt =>
                opt.name === "Ministry Event - Women 2 Women" ||
                opt.name === "Ministry Event - MOVEMENT"
            );
        }

        allOptions.push(...adminOptions);
    }

    // Render each option into the <select>
    allOptions.forEach(eventObj => {
        const option = document.createElement('option');
        option.value = eventObj.name;
        option.textContent = eventObj.name;
        option.dataset.setsMaxCapacity = eventObj.setsMaxCapacity;
        eventSelector.appendChild(option);
    });
}
