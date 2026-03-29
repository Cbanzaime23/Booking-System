"""
test_user_journey.py — User flow test scenarios for the CCF Booking System.

Tests the regular (non-admin) user experience:
  1. Page loads correctly with role-selection modal
  2. User login flow
  3. Room selection changes calendar
  4. Clicking available slot opens time-selection modal
  5. Booking form flow (time selection → booking form)
  6. Clicking booked slot shows info modal (no admin buttons)
  7. Info modal close button works
"""

import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

from conftest import (
    BASE_URL,
    login_as_user,
    wait_for_element,
    wait_for_element_clickable,
    wait_for_element_present,
    wait_for_modal_open,
    wait_for_modal_close,
    wait_for_data_load,
    find_slot_by_status,
    find_slot_by_status_with_navigation,
    is_element_visible,
)


class TestUserPageLoad:
    """Verify the page loads and the role-selection modal appears."""

    def test_page_loads_with_title(self, browser):
        """Page should load and have a meaningful title."""
        browser.get(BASE_URL)
        assert browser.title, "Page title should not be empty"

    def test_role_selection_modal_appears(self, browser):
        """The role-selection modal should appear on page load."""
        browser.get(BASE_URL)
        modal = wait_for_modal_open(browser, "role-selection-modal")
        assert modal is not None, "Role selection modal should be open"

    def test_role_buttons_visible(self, browser):
        """Both 'Continue as User' and 'Continue as Admin' buttons should be visible."""
        browser.get(BASE_URL)
        wait_for_modal_open(browser, "role-selection-modal")
        user_btn = browser.find_element(By.ID, "role-user-btn")
        admin_btn = browser.find_element(By.ID, "role-admin-btn")
        assert user_btn.is_displayed(), "User button should be visible"
        assert admin_btn.is_displayed(), "Admin button should be visible"


class TestUserLogin:
    """Verify the user login flow works correctly."""

    def test_user_login_closes_modal(self, browser):
        """Clicking 'Continue as User' should close the role modal."""
        login_as_user(browser)
        modal = browser.find_element(By.ID, "role-selection-modal")
        assert modal.get_attribute("open") is None, "Role modal should be closed after login"

    def test_calendar_visible_after_login(self, browser):
        """The calendar grid should be visible after user login."""
        login_as_user(browser)
        calendar = wait_for_element(browser, By.ID, "calendar-slots-grid")
        assert calendar.is_displayed(), "Calendar grid should be visible"

    def test_room_selector_visible(self, browser):
        """The room selector dropdown should be visible after login."""
        login_as_user(browser)
        room_selector = wait_for_element(browser, By.ID, "room-selector")
        assert room_selector.is_displayed(), "Room selector should be visible"


class TestRoomSelection:
    """Verify room switching functionality."""

    def test_room_dropdown_has_options(self, browser):
        """Room dropdown should contain the configured rooms."""
        login_as_user(browser)
        select_el = browser.find_element(By.ID, "room-selector")
        options = select_el.find_elements(By.TAG_NAME, "option")
        room_names = [opt.text for opt in options]
        assert "Main Hall" in room_names, "Main Hall should be in room options"
        assert len(room_names) >= 2, "There should be at least 2 rooms"

    def test_switching_room_updates_calendar(self, browser):
        """Changing the room should refresh the calendar slots."""
        login_as_user(browser)
        select = Select(browser.find_element(By.ID, "room-selector"))

        # Switch to a non-default room
        select.select_by_visible_text("Jonah")
        time.sleep(1)

        # Calendar should still have time slots
        slots = browser.find_elements(By.CSS_SELECTOR, ".time-slot")
        assert len(slots) > 0, "Calendar should have time slots after room switch"


class TestAvailableSlotClick:
    """Verify clicking an available slot opens the time-selection modal.
    Uses the Next button to navigate across weeks to find available slots."""

    def test_click_available_slot_opens_time_selection(self, browser):
        """Clicking an available time slot should open the time-selection modal."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "available")
        if not slot:
            pytest.skip("No available slots found within searched weeks — cannot test")

        slot.click()
        time.sleep(0.5)
        modal = wait_for_modal_open(browser, "time-selection-modal")
        assert modal is not None, "Time selection modal should open"

    def test_time_selection_shows_start_time(self, browser):
        """The time-selection modal should display the selected start time."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "available")
        if not slot:
            pytest.skip("No available slots found")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "time-selection-modal")

        start_display = browser.find_element(By.ID, "display-start-time")
        assert start_display.text.strip(), "Start time should be displayed"

    def test_time_selection_has_end_time_dropdown(self, browser):
        """The end time dropdown should have selectable options."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "available")
        if not slot:
            pytest.skip("No available slots found")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "time-selection-modal")

        end_select = browser.find_element(By.ID, "selection-end-time")
        options = end_select.find_elements(By.TAG_NAME, "option")
        assert len(options) > 0, "End time dropdown should have options"


class TestBookingFormFlow:
    """Verify the complete booking form flow: time selection → booking form."""

    def test_confirm_time_opens_booking_form(self, browser):
        """After confirming time selection, the booking form modal should open."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "available")
        if not slot:
            pytest.skip("No available slots found")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "time-selection-modal")

        # Click confirm
        confirm_btn = wait_for_element_clickable(browser, By.ID, "time-selection-confirm-btn")
        confirm_btn.click()
        time.sleep(0.5)

        # Booking form modal should open
        modal = wait_for_modal_open(browser, "booking-modal")
        assert modal is not None, "Booking form modal should open after time confirmation"

    def test_booking_form_has_required_fields(self, browser):
        """The booking form should contain first name, last name, email, and event fields."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "available")
        if not slot:
            pytest.skip("No available slots found")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "time-selection-modal")

        confirm_btn = wait_for_element_clickable(browser, By.ID, "time-selection-confirm-btn")
        confirm_btn.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "booking-modal")

        # Check required fields exist
        assert browser.find_element(By.ID, "first_name"), "First name field should exist"
        assert browser.find_element(By.ID, "last_name"), "Last name field should exist"
        assert browser.find_element(By.ID, "email"), "Email field should exist"
        assert browser.find_element(By.ID, "event"), "Event type dropdown should exist"


class TestBookedSlotUserView:
    """Verify non-admin users see the info modal when clicking booked slots.
    Uses the Next button to navigate across weeks to find booked slots."""

    def test_partial_slot_shows_info_modal(self, browser):
        """Clicking a partially booked slot as a user should show the info modal."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "partial")
        if not slot:
            pytest.skip("No partially booked slots found within searched weeks")

        slot.click()
        time.sleep(0.5)

        # User info modal should appear
        modal = wait_for_modal_open(browser, "user-slot-info-modal")
        assert modal is not None, "User slot info modal should open for non-admin users"

        # Admin choice modal should NOT appear
        choice_modal = browser.find_element(By.ID, "choice-modal")
        assert choice_modal.get_attribute("open") is None, "Admin choice modal should NOT open for users"

    def test_info_modal_has_book_button_for_partial(self, browser):
        """The info modal for a partial slot should show the 'Book This Slot' button."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "partial")
        if not slot:
            pytest.skip("No partially booked slots found")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "user-slot-info-modal")

        book_btn = browser.find_element(By.ID, "user-slot-info-book-btn")
        assert book_btn.is_displayed(), "Book This Slot button should be visible for partial slots"

    def test_full_slot_shows_info_modal_without_book_button(self, browser):
        """Clicking a fully booked slot should show the info modal WITHOUT the Book button."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "full")
        if not slot:
            pytest.skip("No fully booked slots found within searched weeks")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "user-slot-info-modal")

        book_btn = browser.find_element(By.ID, "user-slot-info-book-btn")
        assert not book_btn.is_displayed(), "Book button should be hidden for full slots"

    def test_info_modal_shows_cancellation_instruction(self, browser):
        """The info modal should contain the cancellation-via-email instruction text."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "partial")
        if not slot:
            slot = find_slot_by_status_with_navigation(browser, "full")
        if not slot:
            pytest.skip("No booked slots found")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "user-slot-info-modal")

        modal_text = browser.find_element(By.ID, "user-slot-info-modal").text
        assert "cancellation link" in modal_text.lower() or "confirmation email" in modal_text.lower(), \
            "Info modal should mention cancellation via email"

    def test_info_modal_close_button(self, browser):
        """Clicking 'Close' on the info modal should close it."""
        login_as_user(browser)

        slot = find_slot_by_status_with_navigation(browser, "partial")
        if not slot:
            slot = find_slot_by_status_with_navigation(browser, "full")
        if not slot:
            pytest.skip("No booked slots found")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "user-slot-info-modal")

        close_btn = wait_for_element_clickable(browser, By.ID, "user-slot-info-close-btn")
        close_btn.click()
        time.sleep(0.5)

        wait_for_modal_close(browser, "user-slot-info-modal")
        modal = browser.find_element(By.ID, "user-slot-info-modal")
        assert modal.get_attribute("open") is None, "Info modal should be closed after clicking Close"
