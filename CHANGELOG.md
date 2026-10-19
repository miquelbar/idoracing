# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Line offset in metres versus the reference lap at corner entry, apex and exit, for laps recorded with position data (LMU and AC MoTeC exports).

### Changed
- Relicensed under GPL-3.0; the MoTeC reader follows gotzl/ldparser's file layout. See NOTICE.
- Laps that only carry lap times (LMU results, the demo) are marked as synthetic, no longer get mistakes planted at fixed corners, and the UI shows a warning banner over their charts.
- Tracks other than Valencia and Sebring get corners detected from the speed trace and an outline dead-reckoned from speed and lateral acceleration, instead of Valencia's layout.
- The coach report's confidence reflects the data (and drops on synthetic laps); the radio chat reports whether the LLM or the rule-based fallback answered.
- Compose binds to `127.0.0.1` by default.

### Removed
- The car setup sheet and setup advice: no importer reads setup data, so every session showed the same hardcoded values.
- The legacy Streamlit UI.

### Fixed
- Uploading or importing `.ld` and `.csv` files returned HTTP 500.
- MoTeC laps now carry their own telemetry, split by `.ldx` markers or lap-distance resets, with pedals rescaled from percent.
- CSV laps start at zero time and distance.
- Any website could change the cloud LLM endpoint through open CORS and receive the API key; CORS is closed and changing the endpoint clears the key.
- Importing by path is limited to the simulator telemetry folders; uploads are capped at 512 MB.
- `.env` is loaded on native runs, not only under Docker Compose.
- MoTeC files from LMU decoded speeds, pedals and gear wrongly (multiplier applied after the shift, 1-byte channels read as 2 bytes).
- MoTeC laps are cut by the lap-number channel when there is no `.ldx`, and laps are aligned on track position, so a lap started from the grid or the pit exit compares against the right part of the track.

## [0.2.0] - 2026-10-18

### Changed
- Rebranded project to **IdoRacing Analytics**, broadening support to multiple racing simulators (Assetto Corsa Competizione, Le Mans Ultimate, iRacing).
- Transformed interface into an interactive **Motorsport Telemetry Suite**:
  - Timing Tower with micro-sectors and real-time gap badges.
  - Interactive 2D track map with continuous speed delta ($\Delta V$) color gradients and corner markers.
  - Segment selector for corner-by-corner deep dive with automatic graph zooming.
  - Dedicated segment HUD cards for braking points, apex minimum speed ($V_{min}$), and throttle pickup.

### Added
- Native session and result XML importer for **Le Mans Ultimate (LMU)**.
- Automatic telemetry folder discovery for both ACC and LMU on Linux Steam Proton.
- LAN access configuration (`0.0.0.0:8501`) with firewalld rules.

## [0.1.0] - 2026-10-18

### Added
- MoTeC `.ld` binary parser and `.ldx` XML lap markers reader.
- Distance-based telemetry alignment and continuous cumulative delta time ($\Delta t$).
- Local AI Coach integration with Ollama (tested with `qwen3:14b` and `qwen3.8:27b-32k`).
- SQLite storage layer for sessions and coaching debriefs.
- Containerization with Dockerfile and Compose.
