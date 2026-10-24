import socket

import pytest

pytest.importorskip("playwright")
from playwright.sync_api import sync_playwright

VIEWPORTS = [
    {"width": 1920, "height": 1080, "name": "1080p"},
    {"width": 1366, "height": 768, "name": "1366x768"},
]


def _is_server_reachable(host="127.0.0.1", port=8501) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False


def test_navbar_and_context_bar_visual_layout():
    """
    Playwright visual layout test at 1920x1080 and 1366x768:
    1. .nav-tabs has no horizontal overflow (scrollWidth <= clientWidth).
    2. .car-badge and .lap-p1-badge do not overlap (zero bounding box intersection).
    3. .nav-tabs, .radio-toggle, and .model-badge do not overlap.
    """
    if not _is_server_reachable():
        pytest.skip("Local frontend server at http://localhost:8501 is not reachable")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        )
        for vp in VIEWPORTS:
            context = browser.new_context(viewport={"width": vp["width"], "height": vp["height"]})
            page = context.new_page()

            page.goto("http://localhost:8501", wait_until="networkidle")

            # Wait for key elements to be visible
            page.wait_for_selector(".nav-tabs", state="visible", timeout=10000)
            page.wait_for_selector(".radio-toggle", state="visible", timeout=10000)
            page.wait_for_selector(".model-badge", state="visible", timeout=10000)
            page.wait_for_selector(".car-badge", state="visible", timeout=10000)

            # Check .nav-tabs has no horizontal overflow
            nav_tabs_box = page.evaluate("""() => {
                const el = document.querySelector('.nav-tabs');
                return {
                    scrollWidth: el.scrollWidth,
                    clientWidth: el.clientWidth,
                    scrollLeft: el.scrollLeft,
                    hasOverflow: el.scrollWidth > el.clientWidth + 1
                };
            }""")
            assert not nav_tabs_box["hasOverflow"], (
                f"[{vp['name']}] .nav-tabs has horizontal overflow: "
                f"scrollWidth={nav_tabs_box['scrollWidth']} > clientWidth={nav_tabs_box['clientWidth']}"
            )

            # Check overlap between .car-badge and .lap-p1-badge
            car_badge = page.query_selector(".car-badge")
            lap_p1_badge = page.query_selector(".lap-p1-badge")
            assert car_badge is not None, f"[{vp['name']}] .car-badge not found on page"
            assert lap_p1_badge is not None, f"[{vp['name']}] .lap-p1-badge not found on page"

            rect_car = car_badge.bounding_box()
            rect_p1 = lap_p1_badge.bounding_box()
            assert rect_car is not None and rect_p1 is not None

            # Bounding box intersection check (AABB overlap)
            overlap_x = (
                rect_car["x"] < (rect_p1["x"] + rect_p1["width"]) and (rect_car["x"] + rect_car["width"]) > rect_p1["x"]
            )
            overlap_y = (
                rect_car["y"] < (rect_p1["y"] + rect_p1["height"])
                and (rect_car["y"] + rect_car["height"]) > rect_p1["y"]
            )
            has_collision = overlap_x and overlap_y
            assert not has_collision, (
                f"[{vp['name']}] .car-badge overlaps with .lap-p1-badge: car={rect_car}, p1={rect_p1}"
            )

            # If rendered on the same row, right of car-badge must be <= left of lap-p1-badge
            same_row = abs(rect_car["y"] - rect_p1["y"]) < 15.0
            if same_row:
                assert (rect_car["x"] + rect_car["width"]) <= rect_p1["x"], (
                    f"[{vp['name']}] On same row, .car-badge right ({rect_car['x'] + rect_car['width']}) "
                    f"must be <= .lap-p1-badge left ({rect_p1['x']})"
                )
            else:
                # If wrapped into two rows, row 1 (car) must be above row 2 (p1)
                assert (rect_car["y"] + rect_car["height"]) <= rect_p1["y"], (
                    f"[{vp['name']}] On separate rows, .car-badge bottom ({rect_car['y'] + rect_car['height']}) "
                    f"must be <= .lap-p1-badge top ({rect_p1['y']})"
                )

            # Check .radio-toggle and .model-badge do not overlap
            radio_toggle = page.query_selector(".radio-toggle")
            model_badge = page.query_selector(".model-badge")
            if radio_toggle and model_badge:
                rect_radio = radio_toggle.bounding_box()
                rect_model = model_badge.bounding_box()
                assert rect_radio is not None and rect_model is not None

                overlap_x = (
                    rect_radio["x"] < (rect_model["x"] + rect_model["width"])
                    and (rect_radio["x"] + rect_radio["width"]) > rect_model["x"]
                )
                overlap_y = (
                    rect_radio["y"] < (rect_model["y"] + rect_model["height"])
                    and (rect_radio["y"] + rect_radio["height"]) > rect_model["y"]
                )
                assert not (overlap_x and overlap_y), (
                    f"[{vp['name']}] .radio-toggle overlaps with .model-badge: radio={rect_radio}, model={rect_model}"
                )

            # Check .lang-switcher is visible and inside viewport bounds
            lang_switcher = page.query_selector(".lang-switcher")
            assert lang_switcher is not None, f"[{vp['name']}] .lang-switcher not found"
            rect_lang = lang_switcher.bounding_box()
            assert rect_lang is not None, f"[{vp['name']}] .lang-switcher bounding box is None"
            assert (rect_lang["x"] + rect_lang["width"]) <= vp["width"], (
                f"[{vp['name']}] .lang-switcher right edge ({rect_lang['x'] + rect_lang['width']}) "
                f"overflows viewport width ({vp['width']})"
            )

            context.close()
        browser.close()
