"""
MoTeC .ld and .ldx binary and XML parser for Assetto Corsa Competizione (ACC) telemetry.
Implements binary decoding according to the MoTeC Logged Data (.ld) structure and XML lap markers (.ldx).

The header, channel and event layouts follow gotzl/ldparser
(https://github.com/gotzl/ldparser), licensed under GPL-3.0.
"""

import logging
import os
import struct
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


def _decode_cstring(b: bytes) -> str:
    """Decode null-terminated or fixed-width ASCII string."""
    return b.decode("ascii", errors="replace").split("\x00")[0].strip()


class MoTeCChannel:
    """Represents a single telemetry channel extracted from a MoTeC .ld file."""

    FMT = "<IIIIHHHHhhhh32s8s12s40x"

    def __init__(
        self,
        name: str,
        short_name: str,
        unit: str,
        freq: int,
        data_ptr: int,
        data_len: int,
        dtype: Any,
        shift: int,
        mul: int,
        scale: int,
        dec: int,
        data: np.ndarray | None = None,
    ):
        self.name = name
        self.short_name = short_name
        self.unit = unit
        self.freq = freq
        self.data_ptr = data_ptr
        self.data_len = data_len
        self.dtype = dtype
        self.shift = shift
        self.mul = mul
        self.scale = scale if scale != 0 else 1
        self.dec = dec
        self.data = data

    @classmethod
    def from_binary(cls, f, meta_ptr: int) -> tuple["MoTeCChannel", int]:
        """Read channel metadata from binary stream. Returns (channel, next_meta_ptr)."""
        f.seek(meta_ptr)
        block = f.read(struct.calcsize(cls.FMT))
        if len(block) < struct.calcsize(cls.FMT):
            raise ValueError(f"Incomplete channel header at offset {meta_ptr}")

        (
            prev_meta_ptr,
            next_meta_ptr,
            data_ptr,
            data_len,
            counter,
            dtype_a,
            dtype_b,
            freq,
            shift,
            mul,
            scale,
            dec,
            raw_name,
            raw_short,
            raw_unit,
        ) = struct.unpack(cls.FMT, block)

        name = _decode_cstring(raw_name)
        short_name = _decode_cstring(raw_short)
        unit = _decode_cstring(raw_unit)

        # Resolve numpy dtype from MoTeC type flags
        if dtype_a == 0x07:
            dtype_map = {1: np.float16, 2: np.float16, 4: np.float32}
            dtype = dtype_map.get(dtype_b, np.float32)
        elif dtype_a in [0, 0x03, 0x05]:
            dtype_map = {2: np.int16, 4: np.int32}
            dtype = dtype_map.get(dtype_b, np.int16 if dtype_a == 0x03 else np.int32)
        elif dtype_a == 0x08 and dtype_b == 0x08:
            dtype = np.float64
        else:
            dtype = np.float32

        chan = cls(
            name=name,
            short_name=short_name,
            unit=unit,
            freq=freq if freq > 0 else 20,
            data_ptr=data_ptr,
            data_len=data_len,
            dtype=dtype,
            shift=shift,
            mul=mul if mul != 0 else 1,
            scale=scale if scale != 0 else 1,
            dec=dec,
        )
        return chan, next_meta_ptr

    def load_data(self, f) -> np.ndarray:
        """Load and calibrate channel samples from binary stream."""
        if self.data is not None:
            return self.data

        if self.data_len == 0 or self.data_ptr == 0:
            self.data = np.array([], dtype=np.float32)
            return self.data

        f.seek(self.data_ptr)
        raw_bytes = f.read(self.data_len * np.dtype(self.dtype).itemsize)
        raw_vals = np.frombuffer(raw_bytes, dtype=self.dtype)

        # Calibration formula: ((raw / scale) * 10^(-dec) + shift) * mul
        calibrated = (raw_vals.astype(np.float64) / float(self.scale) * (10.0 ** (-self.dec)) + float(self.shift)) * float(self.mul)
        self.data = calibrated.astype(np.float32)
        return self.data


class MoTeCLDParser:
    """Parser for MoTeC .ld binary log files."""

    HEADER_FMT = (
        "<"
        "I4x"       # 0: ldmarker (0x40)
        "II"        # 1,2: meta_ptr, data_ptr
        "20x"       # padding
        "I"         # 3: event_ptr
        "24x"       # padding
        "HHH"       # 4,5,6: static numbers
        "I"         # 7: device serial
        "8s"        # 8: device type
        "H"         # 9: device version
        "H"         # 10: static number
        "I"         # 11: num_channs
        "4x"        # padding
        "16s"       # 12: date
        "16x"       # padding
        "16s"       # 13: time
        "16x"       # padding
        "64s"       # 14: driver
        "64s"       # 15: vehicleid
        "64x"       # padding
        "64s"       # 16: venue
        "64x"       # padding
        "1024x"     # padding
        "I"         # 17: pro logging flag
        "66x"       # padding
        "64s"       # 18: short comment
        "126x"      # padding
    )

    def __init__(self, filepath: str):
        self.filepath = filepath
        self.driver: str = ""
        self.vehicle: str = ""
        self.venue: str = ""
        self.date_time: datetime = datetime.now()
        self.comment: str = ""
        self.channels: dict[str, MoTeCChannel] = {}

    def parse(self) -> "MoTeCLDParser":
        """Read and parse the .ld file."""
        if not os.path.exists(self.filepath):
            raise FileNotFoundError(f"File not found: {self.filepath}")

        with open(self.filepath, "rb") as f:
            header_size = struct.calcsize(self.HEADER_FMT)
            header_bytes = f.read(header_size)
            if len(header_bytes) < header_size:
                raise ValueError("MoTeC file is corrupted or truncated (invalid header length)")

            unpacked = struct.unpack(self.HEADER_FMT, header_bytes)
            marker = unpacked[0]
            if marker != 0x40:
                raise ValueError(f"Invalid MoTeC magic identifier: {hex(marker)} (expected 0x40)")

            meta_ptr = unpacked[1]
            raw_date = _decode_cstring(unpacked[12])
            raw_time = _decode_cstring(unpacked[13])
            self.driver = _decode_cstring(unpacked[14])
            self.vehicle = _decode_cstring(unpacked[15])
            self.venue = _decode_cstring(unpacked[16])
            self.comment = _decode_cstring(unpacked[18])

            try:
                self.date_time = datetime.strptime(f"{raw_date} {raw_time}", "%d/%m/%Y %H:%M:%S")
            except ValueError:
                try:
                    self.date_time = datetime.strptime(f"{raw_date} {raw_time}", "%d/%m/%Y %H:%M")
                except ValueError:
                    self.date_time = datetime.now()

            # Read all channels from linked list
            curr_ptr = meta_ptr
            while curr_ptr != 0:
                chan, next_ptr = MoTeCChannel.from_binary(f, curr_ptr)
                chan.load_data(f)
                self.channels[chan.name] = chan
                curr_ptr = next_ptr

        return self


class MoTeCLDXParser:
    """Parser for MoTeC .ldx XML lap marker files."""

    def __init__(self, filepath: str):
        self.filepath = filepath
        self.laps: list[dict[str, Any]] = []

    def parse(self) -> "MoTeCLDXParser":
        """Parse XML marker file containing lap markers."""
        if not os.path.exists(self.filepath):
            return self

        try:
            tree = ET.parse(self.filepath)
            root = tree.getroot()
            markers = []
            for marker_elem in root.findall(".//Marker"):
                time_val = float(marker_elem.attrib.get("Time", 0.0))
                # Convert microseconds to seconds if time value is suspiciously large (> 100,000)
                if time_val > 100000:
                    time_val /= 1_000_000.0
                dist_val = float(marker_elem.attrib.get("Distance", 0.0))
                lap_num = int(marker_elem.attrib.get("Lap", 0))
                name = marker_elem.attrib.get("Name", "")
                markers.append({
                    "time": time_val,
                    "distance": dist_val,
                    "lap": lap_num,
                    "name": name,
                })

            # Derive lap segments from markers
            # Lap markers generally have Lap > 0
            lap_markers = [m for m in markers if m["lap"] > 0]
            if lap_markers:
                prev_time = markers[0]["time"] if markers else 0.0
                for lm in lap_markers:
                    lap_time = lm["time"] - prev_time
                    if lap_time > 10.0:  # reasonable minimum lap duration
                        self.laps.append({
                            "lap_number": lm["lap"],
                            "lap_time": lap_time,
                            "start_time": prev_time,
                            "end_time": lm["time"],
                        })
                    prev_time = lm["time"]
        except (ET.ParseError, ValueError) as e:
            logger.warning("Ignoring unreadable lap markers in %s: %s", self.filepath, e)
            self.laps = []

        return self


def create_synthetic_ld_bytes(
    driver: str,
    vehicle: str,
    venue: str,
    date_time: datetime,
    channels_data: dict[str, np.ndarray],
    freq: int = 20,
) -> bytes:
    """Utility to generate a binary valid MoTeC .ld file format for tests and synthetic sessions."""
    meta_start = struct.calcsize(MoTeCLDParser.HEADER_FMT)
    chan_size = struct.calcsize(MoTeCChannel.FMT)
    num_chans = len(channels_data)
    data_start = meta_start + num_chans * chan_size

    # Prepare data payloads
    payloads = {}
    curr_data_ptr = data_start
    for name, data in channels_data.items():
        arr = np.asarray(data, dtype=np.float32)
        raw_b = arr.tobytes()
        payloads[name] = {
            "bytes": raw_b,
            "ptr": curr_data_ptr,
            "len": len(arr),
        }
        curr_data_ptr += len(raw_b)

    # Build Header
    date_str = date_time.strftime("%d/%m/%Y")
    time_str = date_time.strftime("%H:%M:%S")
    header_bytes = struct.pack(
        MoTeCLDParser.HEADER_FMT,
        0x40,               # ldmarker
        meta_start,         # meta_ptr
        data_start,         # data_ptr
        0,                  # event_ptr
        1, 0x4240, 0xf,     # statics
        0x1f44,             # serial
        b"ADL\x00\x00\x00\x00\x00",
        420,
        0xadb0,
        num_chans,
        date_str.encode("ascii"),
        time_str.encode("ascii"),
        driver.encode("ascii")[:64],
        vehicle.encode("ascii")[:64],
        venue.encode("ascii")[:64],
        0xc81a4,
        b"IdoRacing Analytics Synthetic Session"[:64],
    )

    # Build Channel headers
    chan_headers = []
    names = list(channels_data.keys())
    for i, name in enumerate(names):
        prev_p = meta_start + (i - 1) * chan_size if i > 0 else 0
        next_p = meta_start + (i + 1) * chan_size if i < num_chans - 1 else 0
        p_info = payloads[name]

        # Name, short name, unit
        unit = "km/h" if "speed" in name.lower() else "%" if ("thr" in name.lower() or "bra" in name.lower()) else "G"
        chan_block = struct.pack(
            MoTeCChannel.FMT,
            prev_p,
            next_p,
            p_info["ptr"],
            p_info["len"],
            0x2ee1 + i,      # counter
            0x07,            # dtype_a (float)
            4,               # dtype_b (float32)
            freq,            # freq
            0,               # shift
            1,               # mul
            1,               # scale
            0,               # dec
            name.encode("ascii")[:32],
            name[:8].encode("ascii"),
            unit.encode("ascii")[:12],
        )
        chan_headers.append(chan_block)

    result = bytearray(header_bytes)
    for ch in chan_headers:
        result.extend(ch)
    for name in names:
        result.extend(payloads[name]["bytes"])

    return bytes(result)
