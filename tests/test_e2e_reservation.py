"""
test_e2e_reservation.py — End-to-End reservation simulation.

This test simulates a real user making a complete booking:
  1. Login as User
  2. Find available slot across weeks 
  3. Confirm time
  4. Fill out the booking form with dummy data
  5. Submit and verify the confirmation flow
  6. Finalize booking and verify success modal
"""

import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC

from conftest import (
    login_as_user,
    wait_for_element,
    wait_for_element_clickable,
    wait_for_modal_open,
    wait_for_modal_close,
    find_slot_by_status_with_navigation,
)

class TestE2EReservation:
    """Simulates a full end-to-end user booking."""

    def test_full_user_booking_flow(self, browser):
        # 1. Login as regular user
        login_as_user(browser)

        # 2. Find an available slot
        slot = find_slot_by_status_with_navigation(browser, "available", max_weeks=8)
        if not slot:
            pytest.skip("No available slots found to run E2E booking test.")

        slot.click()
        
        # 3. Confirm Time Selection
        wait_for_modal_open(browser, "time-selection-modal")
        time_confirm_btn = wait_for_element_clickable(browser, By.ID, "time-selection-confirm-btn")
        time_confirm_btn.click()

        # Wait for time modal to close and booking modal to open
        time.sleep(0.5)
        wait_for_modal_open(browser, "booking-modal")

        # 4. Fill out the booking form
        first_name_input = wait_for_element(browser, By.ID, "first_name")
        first_name_input.send_keys("Christian")

        last_name_input = browser.find_element(By.ID, "last_name")
        last_name_input.send_keys("Ibañez")

        email_input = browser.find_element(By.ID, "email")
        test_email = "christianbiongibanez@gmail.com"
        email_input.send_keys(test_email)

        # Handle confirm email if it exists and is visible
        try:
            confirm_email_input = browser.find_element(By.ID, "confirm_email")
            if confirm_email_input.is_displayed():
                confirm_email_input.send_keys(test_email)
        except Exception:
            pass

        # Fill Dgroup Leader fields
        leader_first = browser.find_element(By.ID, "leader_first_name")
        leader_first.send_keys("Peter")

        leader_last = browser.find_element(By.ID, "leader_last_name")
        leader_last.send_keys("Tan")

        # Select Event Type via JavaScript (Selenium's select_by_value has issues with spaces)
        time.sleep(0.5)
        event_el = wait_for_element(browser, By.ID, "event")
        browser.execute_script("""
            var sel = arguments[0];
            sel.value = 'Ministry Event';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        """, event_el)

        # Accept Housekeeping Rules & Privacy Policy checkboxes
        # Use JS to set checked=true directly (click() can toggle off if already checked)
        browser.execute_script("""
            var terms = document.getElementById('terms-checkbox');
            var privacy = document.getElementById('privacy-checkbox');
            if (terms) { terms.checked = true; terms.dispatchEvent(new Event('change', {bubbles:true})); }
            if (privacy) { privacy.checked = true; privacy.dispatchEvent(new Event('change', {bubbles:true})); }
        """)
        time.sleep(0.5)

        # Debug: Check the state of key form fields before submission
        debug_info = browser.execute_script("""
            var form = document.getElementById('booking-form');
            var eventEl = document.getElementById('event');
            var termsEl = document.getElementById('terms-checkbox');
            var privacyEl = document.getElementById('privacy-checkbox');
            var startIso = document.getElementById('start-iso');
            var endTime = document.querySelector('#end-time');
            return {
                formValid: form ? form.checkValidity() : 'NO_FORM',
                eventValue: eventEl ? eventEl.value : 'NO_EVENT_EL',
                termsChecked: termsEl ? termsEl.checked : 'NO_TERMS',
                privacyChecked: privacyEl ? privacyEl.checked : 'NO_PRIVACY',
                startIso: startIso ? startIso.value : 'NO_START',
                endTime: endTime ? endTime.value : 'NO_END',
                formAlertText: (document.getElementById('booking-form-alert') || {}).textContent || ''
            };
        """)
        print(f"\n=== DEBUG: Form state before submit ===\n{debug_info}\n")

        # 5. Scroll submit button into view and click
        submit_btn = wait_for_element_clickable(browser, By.ID, "submit-booking")
        browser.execute_script("arguments[0].scrollIntoView({block: 'center'});", submit_btn)
        time.sleep(0.3)

        # If form is not valid, try submitting via JS to bypass native validation and see error
        if debug_info.get('formValid') is False:
            print("DEBUG: Form is NOT valid, using requestSubmit() to trigger JS handler")
            browser.execute_script("""
                var form = document.getElementById('booking-form');
                if (form) form.requestSubmit();
            """)
        else:
            submit_btn.click()

        time.sleep(1)

        # Check for any form alert that appeared
        alert_text = browser.execute_script("""
            var alert = document.getElementById('booking-form-alert');
            return alert ? alert.textContent : '';
        """)
        if alert_text:
            print(f"\n=== DEBUG: Form alert after submit: '{alert_text}' ===\n")

        # 6. Wait for Summary Modal and Confirm
        wait_for_modal_open(browser, "confirm-summary-modal", timeout=20)
        time.sleep(1) # Let the user review it mentally
        summary_yes_btn = wait_for_element_clickable(browser, By.ID, "summary-yes-btn")
        summary_yes_btn.click()

        # 7. Wait for the Success Modal (this might take a few seconds due to backend network calls)
        # We increase the timeout here because the Google Apps Script backend takes time
        success_modal = wait_for_modal_open(browser, "success-modal", timeout=30)
        assert success_modal is not None, "Success modal did not open after booking."

        # Verify success message
        success_title = browser.find_element(By.TAG_NAME, "h3").text
        assert "Booking Confirmed" in success_title, "Success title should say Booking Confirmed"

        # 8. Close the Success Modal
        success_done_btn = wait_for_element_clickable(browser, By.ID, "success-done-btn")
        success_done_btn.click()
        
        wait_for_modal_close(browser, "success-modal")
        assert success_modal.get_attribute("open") is None, "Success modal should close after clicking Done"
