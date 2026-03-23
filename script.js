/**
 * @module script
 * @description Main application entry point for the CCF Manila Room Reservation System.
 *
 * Bootstraps the app after DOMContentLoaded: loads HTML components,
 * initializes the DOM cache and state, wires up all event listeners,
 * performs the initial data fetch, and starts the auto-refresh and
 * data-freshness timers.
 *
 * Acts purely as the orchestrator—delegates all heavy logic to
 * dedicated modules (calendar, modals, formHandlers, api, etc.).
 */

import { state, initState, ROOM_CAPACITIES } from './js/state.js';
import { elements, initDOM, setLoading, adjustStickyOffsets, clearAllFormAlerts, showFormAlert, showToast } from './js/utils/dom.js';
import { calculateDuration, parseDate } from './js/utils/date.js';
import { getSlotWarning, isReservationWindowOpen } from './js/utils/validation.js';
import { fetchAllBookings, submitRequest, setRenderCallback, setRenderCalendarButtonsCallback } from './js/api.js';
import { renderCalendarShell, renderBookingsForSelectedRoom, renderCalendarButtons } from './js/calendar.js';
import { renderEventDropdown } from './js/admin.js';
import {
    openTimeSelectionModal,
    openBookingModalForSelectedSlot,
    openCancelModalForSelectedSlot,
    openMoveModalForSelectedSlot,
    openMoveSummaryModal,
    openDuplicateSelectionModalForSelectedSlot,
    handleMyBookingsSubmit,
    updateDurationDisplay,
    updateParticipantRules,
    openFloorplanModal,
    handleEmailCancelDeepLink
} from './js/modals.js';
import { handleMoveFormSubmit, handleBookingFormSubmit, handleCancelFormSubmit, submitPendingCancellation, resumeBookingSubmit } from './js/formHandlers.js';
import { loadComponents } from './js/utils/componentLoader.js';

const DateTime = window.luxon.DateTime;

document.addEventListener('DOMContentLoaded', async () => {
    await loadComponents();
    initDOM();
    initState();

    let autoRefreshIntervalId = null;
    let freshnessTickerId = null;
    const AUTO_REFRESH_MS = 5 * 60 * 1000;
    const FRESHNESS_TICK_MS = 30 * 1000;
    const STALE_THRESHOLD_MS = 6 * 60 * 1000;

    setRenderCallback(render);
    setRenderCalendarButtonsCallback(renderCalendarButtons);

    /** Populates the room <select> dropdown from APP_CONFIG and selects the first room. */
    function initializeRoomSelector() {
        const roomNames = Object.keys(window.APP_CONFIG.ROOM_CONFIG);
        elements.roomSelector.innerHTML = '';
        roomNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            elements.roomSelector.appendChild(option);
        });
        state.selectedRoom = roomNames[0];
        updateRoomCapacityBadge(roomNames[0]);
    }

    /** Updates the "max concurrent groups" badge and Main Hall optimization notice. */
    function updateRoomCapacityBadge(roomName) {
        const badge = document.getElementById('room-max-groups');
        if (badge && window.APP_CONFIG.ROOM_CONFIG[roomName]) {
            badge.textContent = window.APP_CONFIG.ROOM_CONFIG[roomName].MAX_CONCURRENT_GROUPS;
        }
        const notice = document.getElementById('room-optimization-notice');
        if (notice) {
            const isAdmin = document.getElementById('admin-toggle')?.checked || false;
            const showNotice = roomName !== 'Main Hall' && !isAdmin;
            notice.classList.toggle('hidden', !showNotice);
        }
    }

    /**
     * Updates the "last refreshed" indicator bar with a human-readable
     * elapsed time. Marks data as stale after STALE_THRESHOLD_MS.
     */
    function updateFreshnessDisplay() {
        const bar = document.getElementById('data-freshness-bar');
        const textEl = document.getElementById('freshness-text');
        if (!bar || !textEl || !state.lastFetchTimestamp) return;

        const elapsed = Date.now() - state.lastFetchTimestamp;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);

        let text;
        let isStale = false;

        if (seconds < 30) {
            text = 'Updated just now';
        } else if (seconds < 60) {
            text = 'Updated less than a minute ago';
        } else if (minutes === 1) {
            text = 'Updated 1 min ago';
        } else if (minutes < 60) {
            text = `Updated ${minutes} min ago`;
        } else {
            text = `Updated ${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
            isStale = true;
        }

        if (elapsed > STALE_THRESHOLD_MS) isStale = true;

        if (isStale) {
            text += ' — click to refresh';
            bar.className = 'flex items-center justify-center gap-2 px-4 py-1.5 text-xs text-amber-600 cursor-pointer hover:text-amber-700 hover:bg-amber-50 transition-colors rounded-md mx-4 mb-1 select-none';
        } else {
            bar.className = 'flex items-center justify-center gap-2 px-4 py-1.5 text-xs text-gray-400 cursor-pointer hover:text-ccf-blue hover:bg-blue-50/50 transition-colors rounded-md mx-4 mb-1 select-none';
        }

        textEl.textContent = text;
    }

    /** Navigates the calendar forward or backward by one week. */
    function changeWeek(direction) {
        state.currentDate = state.currentDate.plus({ weeks: direction });
        setLoading(true, 'page');
        renderCalendarShell();
        renderBookingsForSelectedRoom();
        setLoading(false, 'page');
    }

    /**
     * Extracts booking metadata from a clicked time-slot's data attributes.
     * @param {HTMLElement} slot - The .time-slot DOM element.
     * @returns {Object} Parsed slot data including startTime, totals, and room rules.
     */
    function parseSlotData(slot) {
        const roomRules = window.APP_CONFIG.ROOM_CONFIG[state.selectedRoom];
        return {
            startTime: DateTime.fromISO(slot.dataset.startIso),
            totalParticipants: parseInt(slot.dataset.totalParticipants || '0', 10),
            totalGroups: parseInt(slot.dataset.totalGroups || '0', 10),
            rules: roomRules
        };
    }

    /**
     * Opens the choice modal (Book / Cancel / Move / Duplicate) for
     * a slot that already has bookings. Hides the Book button if the
     * slot is at capacity. When reservation window is closed and user
     * is not admin, hides Book and disables Move with message.
     */
    function showChoiceModal(roomRules, warningMessage) {
        const bookButton = document.getElementById('choice-book-btn');
        const moveButton = document.getElementById('choice-move-btn');
        const duplicateButton = document.getElementById('choice-duplicate-btn');

        const remainingGroups = roomRules.MAX_CONCURRENT_GROUPS - state.selectedSlot.totalGroups;
        const remainingPax = roomRules.MAX_TOTAL_PARTICIPANTS - state.selectedSlot.totalParticipants;

        // Check reservation window
        const windowStatus = isReservationWindowOpen();
        const windowClosed = !windowStatus.isOpen && !state.isAdmin;

        if (windowClosed) {
            // Hide Book and Duplicate, disable Move
            bookButton.style.display = 'none';
            if (duplicateButton) duplicateButton.classList.add('hidden');
            if (moveButton) {
                moveButton.disabled = true;
                moveButton.classList.add('opacity-50', 'cursor-not-allowed');
                moveButton.title = 'Moving is unavailable — reservations are closed';
            }
        } else {
            bookButton.style.display = (remainingGroups <= 0 || remainingPax < roomRules.MIN_BOOKING_SIZE) ? 'none' : 'inline-block';
            if (duplicateButton) duplicateButton.classList.remove('hidden');
            if (moveButton) {
                moveButton.disabled = false;
                moveButton.classList.remove('opacity-50', 'cursor-not-allowed');
                moveButton.title = '';
            }
        }

        elements.choiceModal.showModal();
        clearAllFormAlerts();

        if (windowClosed) {
            showFormAlert('choice-form-alert', 'Reservations are closed. You may only cancel existing reservations.', 'warning');
        } else if (warningMessage) {
            showFormAlert('choice-form-alert', warningMessage, 'warning');
        }
    }

    /**
     * Delegated click handler for calendar time-slot cells.
     * Determines the slot status and opens the appropriate next step:
     * - When window is closed (non-admin): blocks new bookings with toast
     * - partial/full → choice modal
     * - available → time selection modal
     */
    function handleSlotClick(e) {
        const slot = e.target.closest('.time-slot');
        if (!slot || slot.classList.contains('past')) return;

        // Check reservation window status early for all slots
        const windowStatus = isReservationWindowOpen();

        if (slot.classList.contains('window-closed')) {
            showToast(windowStatus.message, 'error');
            return;
        }

        state.selectedSlot = parseSlotData(slot);
        const warningMessage = getSlotWarning(state.selectedSlot.startTime);
        state.pendingWarning = warningMessage;

        // Check reservation window for available slots (non-admin)
        if (!windowStatus.isOpen && !state.isAdmin) {
            if (slot.classList.contains('available')) {
                showToast(windowStatus.message, 'error');
                return;
            }
        }

        if (slot.classList.contains('partial') || slot.classList.contains('full')) {
            showChoiceModal(state.selectedSlot.rules, warningMessage);
        } else if (slot.classList.contains('available')) {
            openTimeSelectionModal();
        }
    }

    /**
     * Wires all DOM event listeners (buttons, forms, toggles).
     * Called once during initialization.
     */
    function setupEventListeners() {
        elements.roomSelector.addEventListener('change', (e) => {
            state.selectedRoom = e.target.value;
            updateRoomCapacityBadge(e.target.value);
            render();
            // Recalculate sticky offsets since the room optimization notice may have changed the controls height
            setTimeout(() => adjustStickyOffsets(), 50);
        });

        elements.calendarControls.prevWeekBtn.addEventListener('click', () => changeWeek(-1));
        elements.calendarControls.nextWeekBtn.addEventListener('click', () => changeWeek(1));
        elements.calendarView.addEventListener('click', handleSlotClick);

        document.getElementById('choice-book-btn').addEventListener('click', openTimeSelectionModal);
        document.getElementById('choice-cancel-btn').addEventListener('click', openCancelModalForSelectedSlot);
        document.getElementById('choice-back-btn').addEventListener('click', () => elements.choiceModal.close());

        elements.selectionEndTimeInput.addEventListener('input', updateDurationDisplay);
        elements.timeSelectionCancelBtn.addEventListener('click', () => elements.timeSelectionModal.close());
        elements.timeSelectionConfirmBtn.addEventListener('click', () => {
            const endTime = elements.selectionEndTimeInput.value;
            const diff = calculateDuration(state.selectedSlot.startTime, endTime);
            if (!endTime) return showFormAlert('time-selection-alert', 'Please select an end time.', 'error');
            if (diff <= 0) return showFormAlert('time-selection-alert', 'End time must be after start time.', 'error');
            clearAllFormAlerts();
            openBookingModalForSelectedSlot(state.selectedSlot.startTime, endTime);
        });

        const moveBtn = document.getElementById('choice-move-btn');
        if (moveBtn) moveBtn.addEventListener('click', openMoveModalForSelectedSlot);

        const duplicateBtn = document.getElementById('choice-duplicate-btn');
        if (duplicateBtn) duplicateBtn.addEventListener('click', openDuplicateSelectionModalForSelectedSlot);

        if (elements.btnOpenFloorplan) {
            elements.btnOpenFloorplan.addEventListener('click', () => openFloorplanModal());
        }

        if (elements.floorplanModal) {
            const handleCancel = () => {
                elements.floorplanModal.close();
                state.isAutoUpgradeTableSelect = false;
            };
            const closeBtn = elements.floorplanModal.querySelector('#floorplan-close-btn');
            const cancelBtn = elements.floorplanModal.querySelector('#floorplan-cancel-btn');
            if (closeBtn) closeBtn.addEventListener('click', handleCancel);
            if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);

            elements.floorplanModal.querySelectorAll('.table-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const target = e.currentTarget;
                    if (target.dataset.bookingId) {
                        // Admin override flow
                        if (confirm(`Table ${target.dataset.tableId} is booked by ${target.dataset.bookingName}. Move them to another table?`)) {
                            elements.floorplanModal.close();
                            elements.bookingModal.close();
                            openMoveModalForSelectedSlot(target.dataset.bookingId);
                        }
                    } else if (!target.disabled) {
                        elements.selectedTableId.value = target.dataset.tableId;
                        elements.displaySelectedTable.textContent = `Table ${target.dataset.tableId}`;
                        elements.displaySelectedTable.className = 'text-sm font-bold text-ccf-blue';
                        elements.floorplanModal.close();

                        if (state.isAutoUpgradeTableSelect) {
                            state.isAutoUpgradeTableSelect = false;
                            state.pendingBookingData.table_id = target.dataset.tableId;
                            resumeBookingSubmit(state.pendingBookingData, true);
                        }
                    }
                });
            });
        }

        // Many generic listeners
        const eventSelector = elements.bookingForm.querySelector('#event');
        const participantsInput = elements.bookingForm.querySelector('#participants');
        if (eventSelector && participantsInput) {
            eventSelector.addEventListener('change', (e) => {
                const selectedOption = e.target.options[e.target.selectedIndex];
                if (selectedOption && selectedOption.dataset.setsMaxCapacity === 'true') {
                    const roomRules = window.APP_CONFIG.ROOM_CONFIG[state.selectedRoom];
                    const maxCapacity = ROOM_CAPACITIES[state.selectedRoom] || roomRules.MAX_TOTAL_PARTICIPANTS;
                    participantsInput.value = maxCapacity;
                }
            });
        }

        elements.bookingForm.addEventListener('submit', handleBookingFormSubmit);
        elements.cancelForm.addEventListener('submit', handleCancelFormSubmit);
        document.getElementById('move-form').addEventListener('submit', handleMoveFormSubmit);

        document.getElementById('summary-yes-btn').addEventListener('click', () => {
            elements.confirmSummaryModal.close();
            elements.loadingModal.showModal();
            if (state.pendingBookingData) {
                submitRequest('create', state.pendingBookingData);
                state.pendingBookingData = null;
            }
        });
        document.getElementById('summary-no-btn').addEventListener('click', () => elements.confirmSummaryModal.close());

        document.getElementById('move-sum-yes-btn').addEventListener('click', () => {
            document.getElementById('move-summary-modal').close();
            document.getElementById('move-modal').close();
            elements.loadingModal.showModal();
            if (state.pendingMoveData) {
                submitRequest('move', state.pendingMoveData);
                state.pendingMoveData = null;
            }
        });
        document.getElementById('move-sum-no-btn').addEventListener('click', () => document.getElementById('move-summary-modal').close());

        document.getElementById('conflict-proceed-btn').addEventListener('click', () => {
            document.getElementById('conflict-modal').close();
            openMoveSummaryModal();
        });
        document.getElementById('conflict-cancel-btn').addEventListener('click', () => document.getElementById('conflict-modal').close());

        document.getElementById('success-done-btn').addEventListener('click', () => elements.successModal.close());

        document.querySelectorAll('.cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const dialog = btn.closest('dialog');
                if (dialog) dialog.close();
                clearAllFormAlerts();
            });
        });

        // Terms and Privacy Modals
        const termsBtn = document.getElementById('terms-link-btn');
        if (termsBtn) termsBtn.addEventListener('click', () => document.getElementById('terms-modal').showModal());

        const privacyBtn = document.getElementById('privacy-link-btn');
        if (privacyBtn) privacyBtn.addEventListener('click', () => document.getElementById('privacy-modal').showModal());

        const termsCloseBtn = document.getElementById('terms-close-btn');
        if (termsCloseBtn) termsCloseBtn.addEventListener('click', () => document.getElementById('terms-modal').close());

        const privacyCloseBtn = document.getElementById('privacy-close-btn');
        if (privacyCloseBtn) privacyCloseBtn.addEventListener('click', () => document.getElementById('privacy-modal').close());

        // Email Deep Link Cancel Modal Listeners
        const emailCancelYes = document.getElementById('email-cancel-yes-btn');
        if (emailCancelYes) {
            emailCancelYes.addEventListener('click', () => {
                const modal = document.getElementById('email-cancel-confirm-modal');
                if (modal) modal.close();
                if (state.pendingCancelData) {
                    elements.loadingModal.showModal();
                    submitRequest('cancel', {
                        bookingId: state.pendingCancelData.bookingId,
                        bookingCode: state.pendingCancelData.bookingCode,
                        adminPin: '',
                        cancelSeries: false
                    });
                }
            });
        }

        const emailCancelNo = document.getElementById('email-cancel-no-btn');
        if (emailCancelNo) {
            emailCancelNo.addEventListener('click', () => {
                const modal = document.getElementById('email-cancel-confirm-modal');
                if (modal) modal.close();
                state.pendingCancelData = null;
            });
        }
        // Admin-toggle logic removed. Role is now fixed at login and applied during modal open.

        if (elements.myBookingsBtn) {
            elements.myBookingsBtn.addEventListener('click', () => {
                elements.myBookingsModal.showModal();
                elements.myBookingsForm.reset();
                elements.myBookingsResults.querySelectorAll('.booking-item').forEach(e => e.remove());
                elements.myBookingsEmpty.classList.add('hidden');
                elements.myBookingsLoading.classList.add('hidden');
                if (elements.gdprRightsSection) elements.gdprRightsSection.classList.add('hidden');
            });
        }
        if (elements.myBookingsForm) elements.myBookingsForm.addEventListener('submit', handleMyBookingsSubmit);
    }

    /**
     * Full re-render cycle: rebuilds the calendar shell, fetches fresh
     * data from the server, and overlays reservation statuses.
     */
    async function render() {
        setLoading(true, 'page');
        renderCalendarShell();
        try {
            await fetchAllBookings(updateFreshnessDisplay);
            renderBookingsForSelectedRoom();
        } catch (error) {
            console.error("Failed to render:", error);
        } finally {
            setLoading(false, 'page');
        }
    }

    /**
     * Shows role selection modal and returns a Promise that resolves
     * with { isAdmin: boolean } when the user makes a selection.
     */
    function showRoleSelectionModal() {
        return new Promise((resolve) => {
            const modal = document.getElementById('role-selection-modal');
            const userBtn = document.getElementById('role-user-btn');
            const adminBtn = document.getElementById('role-admin-btn');
            const pinSection = document.getElementById('role-admin-pin-section');
            const pinInput = document.getElementById('role-admin-pin');
            const pinError = document.getElementById('role-admin-error');
            const backBtn = document.getElementById('role-admin-back-btn');
            const submitBtn = document.getElementById('role-admin-submit-btn');
            const buttonsDiv = document.getElementById('role-buttons');

            if (!modal) {
                // Fallback if modal doesn't exist
                resolve({ isAdmin: false });
                return;
            }

            modal.showModal();

            // Prevent closing with Escape
            modal.addEventListener('cancel', (e) => e.preventDefault());

            userBtn.addEventListener('click', () => {
                sessionStorage.setItem('ccf_admin_logged_in', 'false');
                modal.close();
                resolve({ isAdmin: false });
            });

            adminBtn.addEventListener('click', () => {
                buttonsDiv.classList.add('hidden');
                pinSection.classList.remove('hidden');
                pinInput.value = '';
                pinError.classList.add('hidden');
                pinInput.focus();
            });

            backBtn.addEventListener('click', () => {
                pinSection.classList.add('hidden');
                buttonsDiv.classList.remove('hidden');
                pinError.classList.add('hidden');
            });

            const attemptAdminLogin = () => {
                const pin = pinInput.value.trim();
                if (!pin) {
                    pinError.textContent = 'Please enter the Admin PIN.';
                    pinError.classList.remove('hidden');
                    return;
                }
                // We validate by making a test request to the backend, but to keep it simple, 
                // we store the PIN and validate it on each request. For now, we accept inputs
                // and validate server-side on actual operations.
                // For UX, we check against a simple JSONP call.
                const callbackName = `admin_check_${Date.now()}`;
                const script = document.createElement('script');
                const payload = encodeURIComponent(JSON.stringify({ admin_pin: pin }));

                submitBtn.disabled = true;
                submitBtn.textContent = 'Verifying...';

                window[callbackName] = (response) => {
                    delete window[callbackName];
                    if (script.parentNode) document.body.removeChild(script);
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Login';

                    if (response.success) {
                        sessionStorage.setItem('ccf_admin_logged_in', 'true');
                        modal.close();
                        resolve({ isAdmin: true, adminPin: pin });
                    } else {
                        pinError.textContent = 'Invalid PIN. Please try again.';
                        pinError.classList.remove('hidden');
                        pinInput.value = '';
                        pinInput.focus();
                    }
                };

                script.src = `${window.APP_CONFIG.APPS_SCRIPT_URL}?action=verify_admin&callback=${callbackName}&payload=${payload}`;
                script.onerror = () => {
                    delete window[callbackName];
                    if (script.parentNode) document.body.removeChild(script);
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Login';
                    pinError.textContent = 'Connection failed. Please try again.';
                    pinError.classList.remove('hidden');
                };
                document.body.appendChild(script);
            };

            submitBtn.addEventListener('click', attemptAdminLogin);
            pinInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    attemptAdminLogin();
                }
            });
        });
    }

    /**
     * Applies admin mode UI changes when logged in as admin.
     */
    function applyAdminMode() {
        // Show admin badge
        const badge = document.getElementById('admin-mode-badge');
        if (badge) badge.classList.remove('hidden'), badge.classList.add('flex');

        // Show dashboard link
        const dashLink = document.getElementById('go-to-dashboard-link');
        if (dashLink) dashLink.classList.remove('hidden'), dashLink.classList.add('flex');

        // Pre-checking the admin toggle is no longer necessary as the role is fixed at login.
    }

    /**
     * One-time initialization: shows role selection, populates the room
     * selector, attaches event listeners, performs the first render, and
     * starts auto-refresh and visibility-change timers.
     */
    async function init() {
        const urlParams = new URLSearchParams(window.location.search);
        const isCancelLink = urlParams.get('action') === 'cancel';

        let roleResult = { isAdmin: false };

        // Skip role selection if it's a direct cancel link
        if (!isCancelLink) {
            roleResult = await showRoleSelectionModal();
        }

        state.isAdmin = roleResult.isAdmin;

        if (state.isAdmin) {
            // Store admin PIN for later use in booking requests
            state.adminPin = roleResult.adminPin;
            applyAdminMode();
        }

        initializeRoomSelector();
        setupEventListeners();
        await render(); // Changed to await to ensure state is fully populated before deep link handles

        if (isCancelLink) {
            const id = urlParams.get('id');
            const code = urlParams.get('code');
            if (id && code) {
                handleEmailCancelDeepLink(id, code);
            }
        }

        adjustStickyOffsets();
        window.addEventListener('resize', adjustStickyOffsets);

        const freshnessBar = document.getElementById('data-freshness-bar');
        if (freshnessBar) {
            freshnessBar.addEventListener('click', () => {
                if (!state.isLoading) render();
            });
        }

        autoRefreshIntervalId = setInterval(() => {
            const anyModalOpen = document.querySelector('dialog[open]');
            if (!anyModalOpen && !document.hidden && !state.isLoading) {
                render();
            }
        }, AUTO_REFRESH_MS);

        freshnessTickerId = setInterval(updateFreshnessDisplay, FRESHNESS_TICK_MS);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && state.lastFetchTimestamp) {
                const elapsed = Date.now() - state.lastFetchTimestamp;
                if (elapsed > AUTO_REFRESH_MS) render();
                updateFreshnessDisplay();
            }
        });
    }

    // START
    init();
});