"""
conftest.py — Shared pytest fixtures and helper utilities for the
CCF Booking System Selenium test suite.

Provides:
  - Chrome browser fixture (visible mode)
  - Login helpers (user / admin)
  - Wait helpers for elements and modals
  - Week-navigation helper to find slots across multiple weeks
"""

import time
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager

# ── Configuration ────────────────────────────────────────────────
BASE_URL = "http://127.0.0.1:3000/index.html"
DASHBOARD_URL = "http://127.0.0.1:3000/dashboard.html"
ADMIN_PIN = "CCFManila@2025"
DEFAULT_WAIT = 15          # seconds
DATA_LOAD_WAIT = 20        # extra time for API data fetch
MAX_WEEKS_TO_SEARCH = 4    # how many weeks to click "Next" when searching for slots


# ── Browser Fixture ──────────────────────────────────────────────
@pytest.fixture(scope="function")
def browser():
    """Launch a visible Chrome browser for each test, quit after."""
    options = Options()
    options.add_argument("--start-maximized")
    options.add_argument("--disable-search-engine-choice-screen")
    options.add_experimental_option("excludeSwitches", ["enable-logging"])

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    driver.implicitly_wait(5)

    yield driver

    driver.quit()


# ── Wait Helpers ─────────────────────────────────────────────────
def wait_for_element(driver, by, value, timeout=DEFAULT_WAIT):
    """Wait until an element is present and visible, then return it."""
    return WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((by, value))
    )


def wait_for_element_clickable(driver, by, value, timeout=DEFAULT_WAIT):
    """Wait until an element is clickable, then return it."""
    return WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, value))
    )


def wait_for_element_present(driver, by, value, timeout=DEFAULT_WAIT):
    """Wait until an element exists in the DOM (may not be visible)."""
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, value))
    )


def wait_for_modal_open(driver, modal_id, timeout=DEFAULT_WAIT):
    """Wait for a <dialog> element to have the 'open' attribute."""
    def _dialog_is_open(drv):
        el = drv.find_element(By.ID, modal_id)
        return el.get_attribute("open") is not None
    WebDriverWait(driver, timeout).until(_dialog_is_open)
    return driver.find_element(By.ID, modal_id)


def wait_for_modal_close(driver, modal_id, timeout=DEFAULT_WAIT):
    """Wait for a <dialog> element to lose the 'open' attribute."""
    def _dialog_is_closed(drv):
        el = drv.find_element(By.ID, modal_id)
        return el.get_attribute("open") is None
    WebDriverWait(driver, timeout).until(_dialog_is_closed)


def wait_for_data_load(driver, timeout=DATA_LOAD_WAIT):
    """Wait until the loading spinner disappears AND at least one time-slot renders."""
    # Wait for loader to hide
    WebDriverWait(driver, timeout).until(
        EC.invisibility_of_element_located((By.ID, "loader"))
    )
    # Wait for at least one time slot to appear in the calendar
    WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, ".time-slot"))
    )


# ── Login Helpers ────────────────────────────────────────────────
def login_as_user(driver):
    """Navigate to the app and click 'Continue as User'."""
    driver.get(BASE_URL)
    wait_for_modal_open(driver, "role-selection-modal")
    btn = wait_for_element_clickable(driver, By.ID, "role-user-btn")
    btn.click()
    wait_for_modal_close(driver, "role-selection-modal")
    wait_for_data_load(driver)


def login_as_admin(driver):
    """Navigate to the app, select Admin, enter PIN, submit.
    The app stays on index.html but activates admin mode (shows admin badge)."""
    driver.get(BASE_URL)
    wait_for_modal_open(driver, "role-selection-modal")

    # Click Continue as Admin
    admin_btn = wait_for_element_clickable(driver, By.ID, "role-admin-btn")
    admin_btn.click()

    # Wait for PIN section to appear
    wait_for_element(driver, By.ID, "role-admin-pin-section")
    time.sleep(0.3)

    # Enter the PIN
    pin_input = driver.find_element(By.ID, "role-admin-pin")
    pin_input.clear()
    pin_input.send_keys(ADMIN_PIN)

    # Submit
    submit_btn = wait_for_element_clickable(driver, By.ID, "role-admin-submit-btn")
    submit_btn.click()

    # Wait for the role modal to CLOSE (indicates successful login)
    wait_for_modal_close(driver, "role-selection-modal")

    # Wait for data to load on the main reservation page
    wait_for_data_load(driver)


def navigate_to_dashboard(driver):
    """After admin login on index.html, navigate to the admin dashboard."""
    driver.get(DASHBOARD_URL)
    time.sleep(2)  # Let dashboard JS initialize


# ── Week Navigation Helper ──────────────────────────────────────
def find_slot_by_status(driver, status_class, timeout=5):
    """Find the first time-slot with the given status class on the CURRENT page.
    Returns the element or None (does NOT navigate weeks)."""
    try:
        return WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, f".time-slot.{status_class}"))
        )
    except TimeoutException:
        return None


def find_slot_by_status_with_navigation(driver, status_class, max_weeks=MAX_WEEKS_TO_SEARCH):
    """Search for a slot with the given status class, clicking 'Next' across weeks.
    Returns the element or None if not found after max_weeks."""
    for week in range(max_weeks):
        slot = find_slot_by_status(driver, status_class, timeout=5)
        if slot:
            return slot

        # Click "Next" to go to the next week
        try:
            next_btn = driver.find_element(By.ID, "next-week")
            next_btn.click()
            time.sleep(2)  # Wait for calendar to re-render
        except NoSuchElementException:
            break

    return None


# ── General Helpers ──────────────────────────────────────────────
def is_element_visible(driver, by, value):
    """Returns True if the element exists and is displayed."""
    try:
        el = driver.find_element(by, value)
        return el.is_displayed()
    except NoSuchElementException:
        return False
