# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Standardized Le Mans Ultimate, AC1, and AC EVO recorder support across root README, CI testing (`test-sim-launchers.sh`), and end-to-end CSV importer test suite (`test_recorder_csv.py`).
- Added end-to-end Wine integration test for LMU recorder (`test-lmu-integration.sh`) running `fakelmu.exe` and `idoracing-recorder.exe`.
- Added in-app telemetry activation and recording guides for Le Mans Ultimate (LMU), Assetto Corsa 1, and Steam launch options in both SessionsView and TelemetryView.
- Multi-simulator support in `idoracing-recorder`: standalone Go recorder now supports **Le Mans Ultimate (LMU)**, **Assetto Corsa 1 (AC)**, and **Assetto Corsa EVO (AC EVO)** in addition to ACC with zero regressions.
  - LMU memory mapping for `$rFactor2SMMP_Telemetry$` and `$rFactor2SMMP_Scoring$` with `#pragma pack(push, 4)`.
  - Kunos shared memory mapping for AC1 (`Local\acpmf_*`) and AC EVO (`Local\acevo_pmf_*` with fallback).
  - Dedicated Linux/Steam Proton launch option scripts (`lmu-with-recorder.sh`, `ac-with-recorder.sh`, `acevo-with-recorder.sh`) and universal auto-detecting launcher `sim-with-recorder.sh`.
- Ideal Ghost engine ("Bubota" 👻): synthesizes theoretical maximum-potential traces (speed, lateral acceleration, throttle pickup, and braking points) based on corner apex minimum speeds and vehicle geometry.
- Telemetry chart enhancements: interactive P1/P2/Bubota toggles, semantic brake/gas palette, and shaded Ideal Trail Braking wedge.
- Smart diff setup comparison: side-by-side P1 vs P2 car setup parameter comparison highlighting changes across Aero, Suspension, Drivetrain, Electronics, and Tyres.
- Multi-sim auto-import: scans and automatically imports telemetry files and session results from all installed simulators (ACC, LMU, AC1, AC EVO) on startup.
- Live debrief radio chatter: periodic radio status messages ("Copy, analyzing telemetry...", "Comparing against reference lap...", "Reviewing vehicle balance...") while Pep evaluates the stint.
- Red Bull Ring (Spielberg) corner reference table with authentic clockwise geometry.
- 107% flying lap rule to automatically filter outlaps, inlaps, and unrepresentative times from rankings.
- `idoracing-recorder`, a standalone Windows recorder for ACC that writes CSV sessions with car position from the game's shared memory, and CSV import of its metadata, position and lap validity.
- Line offset in metres versus the reference lap at corner entry, apex and exit, for laps recorded with position data (LMU and AC MoTeC exports).
- Structured setup advice from Pep: `POST /api/setup-advice` analyzes the lap comparison telemetry and returns prioritized, telemetry-grounded setup recommendations (brake bias, ARBs, TC, ABS, wing, dampers, camber) with numerical evidence and affected corners. Shown in the Car Setup view as an expandable panel below the setup inspector.
- Pep's review of the structured setup advice: `POST /api/setup-advice/review` returns the structured report enriched with Pep's natural-language review (via Ollama when available, rule-based fallback otherwise). Pep checks recommendation consistency, flags conflicts between simultaneous changes, and suggests a testing order. Displayed as a dedicated section in the setup advice panel with Markdown formatting.
- The car setup modal (opened from the telemetry header) now includes the structured setup advice panel below the setup inspector, so recommendations and Pep's review are accessible without leaving the telemetry view.

### Changed
- Sessions workspace redesign: group sessions primarily by track with per-car rows and right-hand workspace for comparing laps across different sessions.
- Consolidated project brand identity across UI, internationalization, and documentation: IdoRacing, Pep (Race Engineer), and Bubota (Ideal Ghost).
- The structured setup advisor no longer emits contradictory recommendations for the same parameter: corners with early braking are classified as a driving technique issue and excluded from understeer detection, and a deduplication pass keeps only the strongest recommendation per category.
- The recorder can be started from ACC's Steam launch options on Linux (`acc-with-recorder.sh`) and stops by itself when ACC closes.
- English users see the racing-line evaluation in English for all six labels.
- Relicensed under GPL-3.0; the MoTeC reader follows gotzl/ldparser's file layout. See NOTICE.
- Laps that only carry lap times (LMU results, the demo) are marked as synthetic, no longer get mistakes planted at fixed corners, and the UI shows a warning banner over their charts.
- Tracks other than Valencia and Sebring get corners detected from the speed trace and an outline dead-reckoned from speed and lateral acceleration, instead of Valencia's layout.
- The coach report's confidence reflects the data (and drops on synthetic laps); the radio chat reports whether the LLM or the rule-based fallback answered.
- Compose binds to `127.0.0.1` by default.

### Removed
- The car setup sheet and setup advice: no importer reads setup data, so every session showed the same hardcoded values.
- The legacy Streamlit UI.

### Fixed
- Fixed setup advice review failing with "Laps not found for setup advice review" by falling back to session laps when ranked flying laps are unavailable.
- Closed circuit loop drift correction preventing trajectory gaps at start/finish line.
- Eliminated garage teleport spikes and enforced turn chirality in 2D track map and segment zoom.
- Filtered partial and pit-lane laps that corrupted inferred circuit outlines.
- Corrected AC EVO session results importer and scanned its native MoTeC directory.
- Decoded ACC MoTeC speed correctly in km/h and synchronized laps with `.ldx` beacons.
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
