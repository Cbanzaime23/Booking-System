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
import { elements, initDOM, setLoading, adjustStickyOffsets, clearAllFormAlerts, showFormAlert } from './js/utils/dom.js';
import { calculateDuration, parseDate } from './js/utils/date.js';
import { getSlotWarning } from './js/utils/validation.js';
import { fetchAllBookings, submitRequest, setRenderCallback, setRenderCalendarButtonsCallback } from './js/api.js';
import { renderCalendarShell, renderBookingsForSelectedRoom, renderCalendarButtons } from './js/calendar.js';
import { renderEventDropdown, openAdminLoginModal, handleAdminLoginSubmit } from './js/admin.js';
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
    openFloorplanModal
} from './js/modals.js';
import { handleMoveFormSubmit, handleBookingFormSubmit, handleCancelFormSubmit, submitPendingCancellation } from './js/formHandlers.js';
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
     * slot is at capacity.
     */
    function showChoiceModal(roomRules, warningMessage) {
        const bookButton = document.getElementById('choice-book-btn');
        const duplicateButton = document.getElementById('choice-duplicate-btn');

        const remainingGroups = roomRules.MAX_CONCURRENT_GROUPS - state.selectedSlot.totalGroups;
        const remainingPax = roomRules.MAX_TOTAL_PARTICIPANTS - state.selectedSlot.totalParticipants;

        bookButton.style.display = (remainingGroups <= 0 || remainingPax < roomRules.MIN_BOOKING_SIZE) ? 'none' : 'inline-block';
        if (duplicateButton) duplicateButton.classList.remove('hidden');

        elements.choiceModal.showModal();
        clearAllFormAlerts();
        if (warningMessage) {
            showFormAlert('choice-form-alert', warningMessage, 'warning');
        }
    }

    /**
     * Delegated click handler for calendar time-slot cells.
     * Determines the slot status and opens the appropriate next step:
     * - partial/full → choice modal
     * - available → time selection modal
     */
    function handleSlotClick(e) {
        const slot = e.target.closest('.time-slot');
        if (!slot || slot.classList.contains('past')) return;

        state.selectedSlot = parseSlotData(slot);
        const warningMessage = getSlotWarning(state.selectedSlot.startTime);
        state.pendingWarning = warningMessage;

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
            elements.btnOpenFloorplan.addEventListener('click', openFloorplanModal);
        }

        if (elements.floorplanModal) {
            const closeBtn = elements.floorplanModal.querySelector('#floorplan-close-btn');
            const cancelBtn = elements.floorplanModal.querySelector('#floorplan-cancel-btn');
            if (closeBtn) closeBtn.addEventListener('click', () => elements.floorplanModal.close());
            if (cancelBtn) cancelBtn.addEventListener('click', () => elements.floorplanModal.close());

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

        document.getElementById('admin-toggle').addEventListener('change', (e) => {
            const isAdmin = e.target.checked;
            renderEventDropdown(isAdmin);
            document.getElementById('user-fields').classList.toggle('hidden', isAdmin);
            document.getElementById('admin-fields').classList.toggle('hidden', !isAdmin);
            document.getElementById('confirm-email-wrapper').classList.toggle('hidden', isAdmin);
            document.getElementById('confirm_email').required = !isAdmin;

            const participantsInput = elements.bookingForm.querySelector('#participants');
            if (isAdmin) {
                participantsInput.removeAttribute('max');
            } else if (state.selectedSlot) {
                participantsInput.max = state.selectedSlot.rules.MAX_PARTICIPANTS_PER_BOOKING;
            }
            if (state.selectedSlot) updateParticipantRules(state.selectedSlot.rules, isAdmin);
            updateRoomCapacityBadge(state.selectedRoom);
        });

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

        const goToDashboardBtn = document.getElementById('go-to-dashboard-btn');
        if (goToDashboardBtn) goToDashboardBtn.addEventListener('click', openAdminLoginModal);
        const adminLoginForm = document.getElementById('admin-login-form');
        if (adminLoginForm) adminLoginForm.addEventListener('submit', handleAdminLoginSubmit);
    }

    /**
     * Full re-render cycle: rebuilds the calendar shell, fetches fresh
     * data from the server, and overlays booking statuses.
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
     * One-time initialization: populates the room selector, attaches
     * event listeners, performs the first render, and starts auto-refresh
     * and visibility-change timers.
     */
    function init() {
        initializeRoomSelector();
        setupEventListeners();
        render();

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