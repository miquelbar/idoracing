import json
import os
import pty
import sys

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tools.moza_leds import (
    NUM_LEDS,
    MozaController,
    build_frame,
    calc_led_bitmask,
    encode_rpm_leds,
    encode_rpm_mode,
)


def test_build_frame_checksum():
    # Frame with cmd [4] and payload [1]: len = 2
    # [0x7E, 2, 0x3F, 0x00, 0x04, 0x01]
    # Sum = 126 + 2 + 63 + 0 + 4 + 1 = 196
    # Checksum = (13 + 196) % 256 = 209 (0xD1)
    frame = build_frame(group=0x3F, dev_id=0x00, cmd_id=[0x04], payload=[0x01])
    assert frame == bytes([0x7E, 0x02, 0x3F, 0x00, 0x04, 0x01, 0xD1])


def test_encode_rpm_mode():
    enable = encode_rpm_mode(True)
    assert enable == bytes([0x7E, 0x02, 0x3F, 0x00, 0x04, 0x01, 0xD1])

    disable = encode_rpm_mode(False)
    # Sum = 126 + 2 + 63 + 0 + 4 + 0 = 195 -> Checksum = (13 + 195) % 256 = 208 (0xD0)
    assert disable == bytes([0x7E, 0x02, 0x3F, 0x00, 0x04, 0x00, 0xD0])


def test_encode_rpm_leds():
    # 0 LEDs: bitmask 0 -> low 0, high 0
    off = encode_rpm_leds(0)
    assert off[0] == 0x7E
    assert off[1] == 4  # len([0x1A, 0x00]) + len([0, 0])
    assert off[2] == 0x3F
    assert off[3] == 0x00
    assert off[4:6] == bytes([0x1A, 0x00])
    assert off[6:8] == bytes([0x00, 0x00])

    # All 10 LEDs on: bitmask 0x3FF (1023) -> low 0xFF, high 0x03
    all_on = encode_rpm_leds((1 << NUM_LEDS) - 1)
    assert all_on[6:8] == bytes([0xFF, 0x03])


def test_calc_led_bitmask():
    max_rpm = 8000.0

    # 1. Idle or negative: 0 LEDs
    assert calc_led_bitmask(0, max_rpm) == 0
    assert calc_led_bitmask(-100, max_rpm) == 0
    assert calc_led_bitmask(5000, max_rpm) == 0  # 5000 / 8000 = 62.5% < 75%

    # 2. At 75% start threshold: 1 LED active (0b0000000001 = 1)
    mask_start = calc_led_bitmask(6000, max_rpm)  # 6000 / 8000 = 75%
    assert mask_start == 1

    # 3. Mid progressive range: ~5 to 6 LEDs active
    mask_mid = calc_led_bitmask(6850, max_rpm)
    assert 0b0000011111 <= mask_mid <= 0b0000111111

    # 4. At 95% (just below 96% shift): all 10 LEDs on without flashing
    mask_near_shift = calc_led_bitmask(7600, max_rpm, now=0.0)
    assert mask_near_shift == (1 << NUM_LEDS) - 1

    # 5. Shift threshold (>= 96%): flashing at 12Hz
    # At now = 0.0: flash_on is True (int(0.0 / 0.08) % 2 == 0)
    assert calc_led_bitmask(7800, max_rpm, now=0.0) == (1 << NUM_LEDS) - 1
    # At now = 0.09: flash_on is False (int(0.09 / 0.08) % 2 == 1)
    assert calc_led_bitmask(7800, max_rpm, now=0.09) == 0


def test_moza_controller_pty_mock():
    """Verify MozaController serial protocol using a virtual PTY."""
    master_fd, slave_fd = pty.openpty()
    slave_name = os.ttyname(slave_fd)

    try:
        controller = MozaController(port=slave_name)
        assert controller.open() is True

        # Initial frame sent upon open should be encode_rpm_mode(True)
        init_data = os.read(master_fd, 64)
        assert init_data == encode_rpm_mode(True)

        # Update RPM in progressive range (e.g. 5 LEDs)
        controller.update_rpm(rpm=6850, max_rpm=8000, now=1.0)
        led_data = os.read(master_fd, 64)
        assert led_data.startswith(bytes([0x7E, 0x04, 0x3F, 0x00, 0x1A, 0x00]))

        # Timeout check: after 2 seconds idle, turn off LEDs
        controller.check_timeout(now=3.5)
        off_data = os.read(master_fd, 64)
        assert off_data == encode_rpm_leds(0)

        # Close controller: sends LEDs 0 and mode False
        controller.close()
        close_data = os.read(master_fd, 64)
        assert close_data == encode_rpm_leds(0) + encode_rpm_mode(False)
    finally:
        os.close(master_fd)
        os.close(slave_fd)


def test_udp_telemetry_flow():
    """Verify UDP telemetry packet decoding and controller updates."""
    master_fd, slave_fd = pty.openpty()
    slave_name = os.ttyname(slave_fd)

    try:
        controller = MozaController(port=slave_name)
        assert controller.open() is True
        _ = os.read(master_fd, 64)  # drain init

        # Decode simulated JSON telemetry packet
        raw = json.dumps({"rpm": 7800, "max_rpm": 8000, "gear": 3, "speed_kmh": 160.0}).encode()
        data = json.loads(raw.decode("utf-8"))
        controller.update_rpm(rpm=float(data["rpm"]), max_rpm=float(data["max_rpm"]), now=1.0)

        led_data = os.read(master_fd, 64)
        assert len(led_data) == 9
        assert led_data[0] == 0x7E
        assert led_data[6:8] == bytes([0xFF, 0x03])  # all 10 LEDs flashing on

        controller.close()
    finally:
        os.close(master_fd)
        os.close(slave_fd)
