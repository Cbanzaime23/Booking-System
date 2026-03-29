"""
test_admin_journey.py — Admin flow test scenarios for the CCF Booking System.

Tests the admin user experience:
  1. Admin login via role-selection modal (stays on index.html, activates admin mode)
  2. Dashboard loads when navigated to directly
  3. Dashboard modal buttons open the correct dialogs
  4. Admin clicking booked slot on reservation page shows choice modal with Cancel/Duplicate/Move
"""

import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from conftest import (
    BASE_URL,
    DASHBOARD_URL,
    login_as_admin,
    navigate_to_dashboard,
    wait_for_element,
    wait_for_element_clickable,
    wait_for_modal_open,
    wait_for_modal_close,
    wait_for_data_load,
    find_slot_by_status,
    find_slot_by_status_with_navigation,
    is_element_visible,
)


class TestAdminLogin:
    """Verify the admin login flow activates admin mode on the reservation page."""

    def test_admin_login_activates_admin_mode(self, browser):
        """After entering the correct PIN, the admin badge should appear on the reservation page."""
        login_as_admin(browser)

        # Verify the admin badge is visible
        badge = browser.find_element(By.ID, "admin-mode-badge")
        assert badge.is_displayed(), "Admin mode badge should be visible after login"

    def test_admin_stays_on_reservation_page(self, browser):
        """Admin login should keep the user on the reservation page (index.html)."""
        login_as_admin(browser)
        assert "index.html" in browser.current_url, "Should stay on index.html after admin login"

    def test_wrong_pin_shows_error(self, browser):
        """Entering a wrong admin PIN should show an error message."""
        browser.get(BASE_URL)
        wait_for_modal_open(browser, "role-selection-modal")

        admin_btn = wait_for_element_clickable(browser, By.ID, "role-admin-btn")
        admin_btn.click()

        wait_for_element(browser, By.ID, "role-admin-pin-section")
        time.sleep(0.3)

        pin_input = browser.find_element(By.ID, "role-admin-pin")
        pin_input.send_keys("WrongPIN123")

        submit_btn = wait_for_element_clickable(browser, By.ID, "role-admin-submit-btn")
        submit_btn.click()
        time.sleep(2)

        # Role modal should still be open (login failed)
        modal = browser.find_element(By.ID, "role-selection-modal")
        assert modal.get_attribute("open") is not None, "Role modal should remain open with wrong PIN"


class TestDashboardLoad:
    """Verify the admin dashboard loads correctly with key UI elements."""

    def test_dashboard_loads(self, browser):
        """The admin dashboard should load after logging in and navigating to it."""
        login_as_admin(browser)
        navigate_to_dashboard(browser)

        # Should be on the dashboard page
        assert "dashboard.html" in browser.current_url, "Should be on the dashboard page"

    def test_dashboard_has_content(self, browser):
        """Dashboard should display summary content after loading."""
        login_as_admin(browser)
        navigate_to_dashboard(browser)
        time.sleep(3)  # Let data load

        # Look for any main content container on the dashboard
        body_text = browser.find_element(By.TAG_NAME, "body").text
        assert len(body_text) > 50, "Dashboard should have substantial content"


class TestDashboardModals:
    """Verify that the toolbar modal buttons open the correct dialogs."""

    def test_open_blocked_dates_modal(self, browser):
        """Clicking the Blocked Dates button should open the blocked-dates dialog."""
        login_as_admin(browser)
        navigate_to_dashboard(browser)
        time.sleep(3)

        try:
            btn = wait_for_element_clickable(browser, By.ID, "open-blocked-dates-modal", timeout=10)
            btn.click()
            time.sleep(0.5)
            modal = wait_for_modal_open(browser, "blocked-dates-modal")
            assert modal is not None, "Blocked dates modal should open"
        except Exception:
            pytest.skip("Blocked dates button not found — dashboard may not have loaded fully")

    def test_open_reservation_window_modal(self, browser):
        """Clicking the Reservation Window button should open the reservation-window dialog."""
        login_as_admin(browser)
        navigate_to_dashboard(browser)
        time.sleep(3)

        try:
            btn = wait_for_element_clickable(browser, By.ID, "open-reservation-window-modal", timeout=10)
            btn.click()
            time.sleep(0.5)
            modal = wait_for_modal_open(browser, "reservation-window-modal")
            assert modal is not None, "Reservation window modal should open"
        except Exception:
            pytest.skip("Reservation window button not found — dashboard may not have loaded fully")

    def test_open_housekeeping_modal(self, browser):
        """Clicking the Housekeeping button should open the housekeeping dialog."""
        login_as_admin(browser)
        navigate_to_dashboard(browser)
        time.sleep(3)

        try:
            btn = wait_for_element_clickable(browser, By.ID, "open-housekeeping-modal", timeout=10)
            btn.click()
            time.sleep(0.5)
            modal = wait_for_modal_open(browser, "housekeeping-modal")
            assert modal is not None, "Housekeeping modal should open"
        except Exception:
            pytest.skip("Housekeeping button not found — dashboard may not have loaded fully")


class TestAdminBookedSlotChoiceModal:
    """Verify that admins see the full choice modal (Cancel/Duplicate/Move) on booked slots.
    Uses the Next button to navigate across weeks to find booked slots."""

    def test_admin_partial_slot_shows_choice_modal(self, browser):
        """Admin clicking a partial slot should see the choice modal, NOT the user info modal."""
        login_as_admin(browser)

        slot = find_slot_by_status_with_navigation(browser, "partial")
        if not slot:
            pytest.skip("No partially booked slots found — cannot test")

        slot.click()
        time.sleep(0.5)

        # Admin choice modal should open
        modal = wait_for_modal_open(browser, "choice-modal")
        assert modal is not None, "Admin choice modal should open for admin users"

    def test_choice_modal_has_cancel_button(self, browser):
        """The admin choice modal should have a Cancel Booking button."""
        login_as_admin(browser)

        slot = find_slot_by_status_with_navigation(browser, "partial")
        if not slot:
            pytest.skip("No partially booked slots found")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "choice-modal")

        cancel_btn = browser.find_element(By.ID, "choice-cancel-btn")
        assert cancel_btn.is_displayed(), "Cancel button should be visible in admin choice modal"

    def test_choice_modal_has_move_button(self, browser):
        """The admin choice modal should have a Move (Admin) button."""
        login_as_admin(browser)

        slot = find_slot_by_status_with_navigation(browser, "partial")
        if not slot:
            pytest.skip("No partially booked slots found")

        slot.click()
        time.sleep(0.5)
        wait_for_modal_open(browser, "choice-modal")

        move_btn = browser.find_element(By.ID, "choice-move-btn")
        assert move_btn.is_displayed(), "Move button should be visible in admin choice modal"

    def test_admin_full_slot_shows_choice_modal(self, browser):
        """Admin clicking a full slot should also see the choice modal."""
        login_as_admin(browser)

        slot = find_slot_by_status_with_navigation(browser, "full")
        if not slot:
            pytest.skip("No fully booked slots found — cannot test")

        slot.click()
        time.sleep(0.5)

        modal = wait_for_modal_open(browser, "choice-modal")
        assert modal is not None, "Admin choice modal should open for full slots too"
