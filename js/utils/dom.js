/**
 * @module dom
 * @description DOM reference cache, loading indicators, alert/toast helpers.
 *
 * Centralizes all `document.getElementById` lookups into the `elements`
 * object so the rest of the app never queries the DOM directly.
 * Also provides reusable UI primitives for form alerts, toast
 * notifications, and sticky-header offset calculations.
 */

/** Cached DOM element references. Populated by {@link initDOM}. */
export const elements = {};

/**
 * Populates the `elements` cache with references to key DOM nodes.
 * Must be called once after DOMContentLoaded and after components
 * have been injected by the componentLoader.
 */
export function initDOM() {
    elements.calendarDayHeaders = document.getElementById('calendar-day-headers');
    elements.calendarView = document.getElementById('calendar-slots-grid');
    elements.loader = document.getElementById('loader');
    elements.roomSelector = document.getElementById('room-selector');

    elements.choiceModal = document.getElementById('choice-modal');
    elements.bookingModal = document.getElementById('booking-modal');
    elements.bookingForm = document.getElementById('booking-form');
    elements.cancelModal = document.getElementById('cancel-modal');
    elements.cancelForm = document.getElementById('cancel-form');
    elements.confirmSummaryModal = document.getElementById('confirm-summary-modal');
    elements.loadingModal = document.getElementById('loading-modal');
    elements.successModal = document.getElementById('success-modal');
    elements.deniedModal = document.getElementById('denied-modal');
    elements.userSlotInfoModal = document.getElementById('user-slot-info-modal');

    elements.timeSelectionModal = document.getElementById('time-selection-modal');
    elements.displayStartTime = document.getElementById('display-start-time');
    elements.selectionEndTimeInput = document.getElementById('selection-end-time');
    elements.displayDuration = document.getElementById('display-duration');
    elements.timeSelectionConfirmBtn = document.getElementById('time-selection-confirm-btn');
    elements.timeSelectionCancelBtn = document.getElementById('time-selection-cancel-btn');

    elements.floorplanModal = document.getElementById('floorplan-modal');
    elements.tableSelectionWrapper = document.getElementById('table-selection-wrapper');
    elements.selectedTableId = document.getElementById('selected-table-id');
    elements.displaySelectedTable = document.getElementById('display-selected-table');
    elements.btnOpenFloorplan = document.getElementById('btn-open-floorplan');
    elements.timeSelectionConfirmBtn = document.getElementById('time-selection-confirm-btn');
    elements.timeSelectionCancelBtn = document.getElementById('time-selection-cancel-btn');

    elements.calendarControls = {
        prevWeekBtn: document.getElementById('prev-week'),
        nextWeekBtn: document.getElementById('next-week'),
        currentWeekTitle: document.getElementById('current-week-title'),
    };

    elements.myBookingsBtn = document.getElementById('my-bookings-btn');
    elements.myBookingsModal = document.getElementById('my-bookings-modal');
    elements.myBookingsForm = document.getElementById('my-bookings-form');
    elements.myBookingsResults = document.getElementById('my-bookings-results');
    elements.myBookingsEmpty = document.getElementById('my-bookings-empty');
    elements.myBookingsLoading = document.getElementById('my-bookings-loading');

    elements.gdprRightsSection = document.getElementById('gdpr-rights-section');
}

/**
 * Shows or hides the full-page loading spinner.
 * @param {boolean} isLoading - True to show, false to hide.
 * @param {string}  [scope='page'] - Currently only 'page' is supported.
 */
export function setLoading(isLoading, scope = 'page') {
    if (scope === 'page' && elements.loader) {
        elements.loader.classList.toggle('hidden', !isLoading);
    }
}

/**
 * Recalculates CSS custom properties for sticky positioning.
 * Sets `--controls-top` and `--calendar-header-top` on the body
 * so the sticky room selector and calendar day headers stack correctly
 * below the main header without overlapping.
 */
export function adjustStickyOffsets() {
    const headerWrapper = document.getElementById('component-header');
    const header = document.getElementById('main-header');
    const controlsWrapper = document.getElementById('sticky-controls-wrapper');

    if ((!headerWrapper && !header) || !controlsWrapper) return;

    const headerHeight = (headerWrapper || header).offsetHeight;
    const controlsHeight = controlsWrapper.offsetHeight;

    document.body.style.setProperty('--controls-top', `${headerHeight}px`);
    const totalTop = headerHeight + controlsHeight;
    document.body.style.setProperty('--calendar-header-top', `${totalTop}px`);
}

/**
 * Displays an inline alert message inside a form.
 * Replaces any existing content in the alert container.
 *
 * @param {string} alertId  - The DOM id of the alert container element.
 * @param {string} message  - The HTML message to display.
 * @param {'info'|'warning'|'error'} [type='info'] - Visual style variant.
 */
export function showFormAlert(alertId, message, type = 'info') {
    const el = document.getElementById(alertId);
    if (!el) return;

    const styles = {
        info: {
            bg: 'bg-blue-50 border border-blue-200 text-blue-800',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>'
        },
        warning: {
            bg: 'bg-amber-50 border border-amber-200 text-amber-800',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>'
        },
        error: {
            bg: 'bg-red-50 border border-red-200 text-red-800',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mt-0.5 flex-shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>'
        }
    };

    const s = styles[type] || styles.info;
    el.className = `mb-3 flex items-start gap-2 text-xs rounded-md px-3 py-2.5 ${s.bg}`;
    el.innerHTML = `${s.icon}<span>${message}</span>`;
    el.classList.remove('hidden');
}

/**
 * Hides and clears the content of a single form alert container.
 * @param {string} alertId - The DOM id of the alert container.
 */
export function clearFormAlert(alertId) {
    const el = document.getElementById(alertId);
    if (el) {
        el.classList.add('hidden');
        el.innerHTML = '';
    }
}

/**
 * Clears all known form alert containers across all modals.
 */
export function clearAllFormAlerts() {
    ['booking-form-alert', 'cancel-form-alert', 'move-form-alert', 'choice-form-alert'].forEach(clearFormAlert);
}

/**
 * Appends an additional alert message to an existing alert container
 * (stacking multiple messages). Unlike {@link showFormAlert}, this
 * does not replace existing content.
 *
 * @param {string} alertId  - The DOM id of the alert container.
 * @param {string} message  - The HTML message to append.
 * @param {'info'|'warning'|'error'} [type='info'] - Visual style variant.
 */
export function appendFormAlert(alertId, message, type = 'info') {
    const el = document.getElementById(alertId);
    if (!el) return;

    const styles = {
        info: {
            bg: 'bg-blue-50 border-blue-200 text-blue-800',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>'
        },
        warning: {
            bg: 'bg-amber-50 border-amber-200 text-amber-800',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>'
        },
        error: {
            bg: 'bg-red-50 border-red-200 text-red-800',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mt-0.5 flex-shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>'
        }
    };

    const s = styles[type] || styles.info;
    const alertDiv = document.createElement('div');
    alertDiv.className = `flex items-start gap-2 text-xs rounded-md px-3 py-2 border ${s.bg}`;
    alertDiv.innerHTML = `${s.icon}<span>${message}</span>`;

    el.className = 'mb-4 space-y-2';
    el.appendChild(alertDiv);
    el.classList.remove('hidden');
}

/**
 * Shows a temporary toast notification that auto-dismisses after 4 seconds.
 * Creates the toast container lazily if it doesn't exist.
 *
 * @param {string} message - Plain text or HTML to display.
 * @param {'info'|'success'|'error'} [type='info'] - Visual style variant.
 */
export function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
        iconSvg = '<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
    } else if (type === 'error') {
        iconSvg = '<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    } else {
        iconSvg = '<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (container.contains(toast)) container.removeChild(toast);
        }, 300);
    }, 4000);
}

/**
 * Shows a persistent toast with Retry and Dismiss buttons.
 * Used for network errors where the user should be offered a retry.
 *
 * @param {string}   message       - The error message to display.
 * @param {'error'|'info'} type    - Visual style variant.
 * @param {Function} retryCallback - Called when the user clicks Retry.
 */
export function showToastWithRetry(message, type, retryCallback) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'error' ? '✖' : 'ℹ';
    toast.innerHTML = `
        <span>${icon}</span>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
            <p style="margin: 0;">${message}</p>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button class="toast-retry-btn" style="
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.4);
                    color: white;
                    padding: 4px 14px;
                    border-radius: 6px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                ">↻ Retry</button>
                <button class="toast-dismiss-btn" style="
                    background: none;
                    border: none;
                    color: rgba(255,255,255,0.7);
                    font-size: 0.8rem;
                    cursor: pointer;
                    text-decoration: underline;
                ">Dismiss</button>
            </div>
        </div>
    `;

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const dismiss = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast-retry-btn').addEventListener('click', () => {
        dismiss();
        if (retryCallback) retryCallback();
    });
    toast.querySelector('.toast-dismiss-btn').addEventListener('click', dismiss);

    const retryBtn = toast.querySelector('.toast-retry-btn');
    retryBtn.addEventListener('mouseenter', () => { retryBtn.style.background = 'rgba(255,255,255,0.35)'; });
    retryBtn.addEventListener('mouseleave', () => { retryBtn.style.background = 'rgba(255,255,255,0.2)'; });
}
