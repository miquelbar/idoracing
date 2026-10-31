# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Full GitHub Actions CI Parity in Local Git Hooks (`githooks/pre-commit` & `githooks/pre-push`)**:
  - Updated `githooks/pre-commit` and added `githooks/pre-push` to execute 100% of `.github/workflows/ci.yml` locally before any commit or push (`ruff check`, `ruff format --check`, `pytest`, `go test ./...`, `linux/test-acc-with-recorder.sh`, `linux/test-sim-launchers.sh`, `GOOS=windows GOARCH=amd64 go build`, `npm run build`, `npm run lint`, and `git fsck`), preventing red CI builds on GitHub.
- **Interactive Peripheral Selector & Telemetry-to-Peripheral Diagnostic Skill (`simracing-peripherals`)**:
  - Each assistant message in `AIDebriefDrawer.tsx` and `EngineerView.tsx` now includes an interactive 3-option peripheral selector (`🎮 Gamepad / Mando`, `🛞 Volante / Cockpit`, `⌨️ Teclado`) styled like the suggested query chips.
  - Selecting a peripheral (or mentioning it in chat) persists the choice, adapts Pep's drill vocabulary, and guarantees via `_ensure_peripheral_section` in `api/server.py` that the in-game controller configuration block (Brake/Steer Gamma, Speed Sensitivity, Steer Filter/Speed, FFB/Load-Cell or Keyboard assist settings) is always included before Pep's signature.
  - Added `.agents/skills/simracing-peripherals/SKILL.md` and expanded `coach/knowledge/gamepad_controller.md` with a 50Hz Telemetry-to-Peripheral Diagnostic Matrix (identifying brake release cliffs, parasitic pedal drag, thumbstick stair-stepping vs FFB clipping on `excess_steer_deg`, and speed-sensitivity slow-corner lock clamping).
- **Recording Health Voice Alerts (Pep)**:
  - The recorder now warns by voice (only when the spotter is active and not muted, max once/min per problem) when the recording is going wrong: `rec_lap_aborted` (return to garage mid-lap), `rec_no_distance` (lap distance not advancing while driving), `rec_no_sim_data` (lost shared memory) and `rec_write_failed` (cannot write the CSV).
  - New bilingual clips versioned in `recorder/voices/es|en`, generated from `tools/generate_pep_voices.py`.
- **Coach Aware of Incomplete Laps**:
  - `/api/coach/report` computes the coverage of P1/P2 against the longest complete lap; when a lap covers < 90% of the circuit (or is incomplete) the report states it, caps confidence at low and, if neither lap is whole, refuses to pick a better one.

### Fixed
- **Pep Chat: Typing Lag, Truncated Answers, Broken Copy & Gamepad Awareness**:
  - The sidebar chat input now owns its draft state and the message history is memoized, so each keystroke no longer re-renders and re-parses the markdown of the whole drawer.
  - Copy buttons work over plain http (e.g. `http://192.168.x.x:8501`) where `navigator.clipboard` does not exist, via a `execCommand` fallback in `frontend/src/utils/clipboard.ts`.
  - Ollama limits raised (`OLLAMA_NUM_PREDICT` 800 -> 2048, `OLLAMA_NUM_CTX` 4096 -> 8192, both overridable); an answer cut by the limit (`done_reason: length`) is now flagged instead of ending mid-sentence.
  - New knowledge module `coach/knowledge/gamepad_controller.md` (Brake/Steer Gamma, Speed Sensitivity, Steer Filter/Speed, Deadzone) retrieved when the driver mentions a gamepad; Pep's prompt now combines technique with those in-game settings, presented as starting values rather than measured data.
- **Teleport-Truncated Laps Poisoning PB & Hiding Corners**:
  - `truncate_teleport_jumps` no longer keeps only the first fragment before a "Return to garage": a later segment that restarts at the line and covers clearly more track (a full lap driven after several garage returns within the same lap number) is kept, and only flagged incomplete when it is not a full lap.
  - `Storage.get_session` re-derives `is_incomplete` for laps covering < 70% of the longest valid lap (the flag was lost once the importer truncated the lap at a garage teleport).
  - `pickDefaultLaps` ignores incomplete/out laps when computing the session PB, so real flying laps are no longer flagged as out-laps and `/telemetry` compares full laps (all corners shown).
- **Recorder Watchdog & Assetto Corsa Rally 5-Minute Stutter Fix**:
  - Fixed `gameWatch` in `recorder/gamewatch.go` prematurely terminating the recorder at 5 minutes when process name detection failed under Wine/Proton.
  - Advancing physics packets (`notePacket` with `packet > 0` or movement in last 10s) now immediately mark `w.seen = true` and keep the watch alive, ensuring the recorder never aborts or causes DXVK/Wine prefix freezing while the car is actively driving.
  - Added support for all Assetto Corsa Rally binary variants (`AssettoCorsaRally.exe`, `ACR-Win64-Shipping.exe`, `acrally.exe`, `acr.exe`) in Go and launch scripts.
- **Telemetry Honesty in AI Debrief (Rule 2 Enforcement)**:
  - Fixed `coach/advisor.py` falsely outputting "Sesión sin canales de telemetría a 50Hz grabados: solo disponemos de los tiempos cronometrados de vuelta y sectores" when discrete corners were unmapped.
  - Decoupled `synthetic` (true missing telemetry) from `comparison.corners`, accurately presenting continuous 50Hz telemetry analysis on rally stages and custom tracks without corners.
- **Generic Physical Distance Tracking (Eliminated Track Lookup Switch)**:
  - Removed `lookupTrackSplineLength` and hardcoded circuit tables from `recorder/pages.go` and `kunos_adapter_windows.go`.
  - Implemented dynamic loop span calibration using clean normalized spline sweeps (`normPos` 0.05 -> 0.95) and physical Euclidean displacement / velocity integration.
- **Collapsible & Compact Live Spotter Radio Card in Debrief**:
  - Refactored `SpotterInfoCard` to start collapsed by default in AI Debrief and Engineer views, exposing only the 3 essential controls (active toggle, volume, and language) without pushing the debrief below the fold.
  - Relocated in-depth architecture explanations and hotkey remapping exclusively to Settings.
- **Auto-Import Disk Thrashing Prevention**:
  - Cached unreadable/no-lap source files in `api/server.py` to prevent 10-second polling from re-parsing skipped files.
  - Prevented auto-import from reading `.csv` files actively being written by the recorder (< 2s modification age).

### Added
- **Assetto Corsa Rally Telemetry Adapter & Auto-detection**:
  - Implemented `newACRallyAdapter()` in `recorder/kunos_adapter_windows.go` connecting directly to Kunos shared memory (`Local\acpmf_physics`, `graphics`, `static`) used by `acr.exe`.
  - Added dedicated rally stage pit/track tracking: immediately marks car on-stage (`in_pit = 0`) upon moving (> 5 km/h) without waiting for a non-existent circuit pit lane.
  - Enhanced launch scripts (`acc-with-recorder.sh`, `sim-with-recorder.sh`, `ac-with-recorder.sh`) to dynamically inspect command line arguments and auto-detect `acr.exe` / `Assetto Corsa Rally`, setting `-sim acrally -exit-with acr.exe`.
  - Updated API server canonical simulator mappings (`AUTO_IMPORT_SIMULATORS`) to recognize and register `Assetto Corsa Rally`.
- **Session-Specific Setup Matching & Fidelity (Rule 2 Enforcement)**:
  - Replaced blind selection of the newest setup file on disk (`st_mtime`) with session-specific matching across LMU, ACC, and AC EVO:
    1. **LMU Trace Log Resolution**: Inspects simulator engine trace logs (`UserData/Log/trace*.txt`) matching the session's timestamp window to identify the exact `.svm` setup requested by `garageLoad.c` before entering the track.
    2. **Temporal Causality Constraint**: Excludes candidate setups modified after the session took place, ensuring older sessions never inherit setups saved at a later date.
    3. **Telemetry Correlation**: Cross-references recorded telemetry channels (brake bias, TC, ABS) against candidate setups to ensure physical consistency with the on-track stint.
    4. **Honest Rule 2 Fallback**: If no setup existed on disk prior to the session or none matches, returns `has_garage_setup = False` with `N/D` for static clicks while preserving 100% of authentic 50Hz dynamic tyre telemetry.
    5. **Setup Switcher & Transparency**: Added an interactive setup selector and verification method badge in the `/setup` UI (`trace_log`, `telemetry_matched`, `session_timestamp`, `user_selected`).
- **Le Mans Ultimate Setup Loader (`.svm`)**:
  - Implemented `importers/lmu_setup_loader.py` to parse proprietary text `.svm` setup files saved by LMU in `UserData/player/Settings/<Track>/<setup>.svm`.
  - Added full parameter extraction for garage mechanical setups: aerodynamics (rear wing angle, front splitter, front/rear ride heights, rake), suspension/chassis (front/rear anti-roll bars, static camber, toe, preload differential), controls/electronics (brake bias, traction control dials, ABS dials, engine mixture/map), and cold tyre pressures.
  - Linked `load_lmu_setup()` in `api/server.py` (`_compute_lap_setup()`), presenting 100% authentic garage setup data on the `/setup` dashboard with `has_garage_setup = True` and eliminating missing `N/D` parameters.

### Fixed
- **LMU Scoring Struct Offset Alignment & Local Player Control Enforcement**:
  - Disassembled `rFactor2SharedMemoryMapPlugin64.dll` to verify Windows LLP64 32-bit `long` alignment: corrected `scoringVehOffset` from 572 to 560, and vehicle stride from 592 to 584 bytes (`0x248`).
  - Corrected track spline length offset from 108 to 100 (`mLapDist`), vehicle count to offset 116, and player name to offset 128.
  - Enforced strict player resolution requiring both `isPlayer == 1` and `ctrl == 0` (local human driver control) in `recorder/lmu_pages.go`, preventing AI traffic from hijacking player car metadata or active car fallbacks from locking permanently to AI vehicles.
- **LMU Shared Memory Buffer Overflow & Multi-Car Player Lock**:
  - Fixed Windows/Wine memory access violation (`signal 0xc0000005`) in `recorder/shm_windows.go`: clamped `actualSize` to committed `mbi.RegionSize` from `VirtualQuery`, preventing reads past the end of the shared memory section when mapping `$rFactor2SMMP_Telemetry$`.
  - Dynamically sized `$rFactor2SMMP_Telemetry$` and `$rFactor2SMMP_Scoring$` mappings (`size = 0`), mapping the complete native buffer created by `rFactor2SharedMemoryMapPlugin64.dll` without hardcoding buffer bounds.
  - Aligned all scoring offsets (`scoringVehOffset = 572`, `vehStride = 592`, `isPlayer = 196`, `mVehicleName = 36..100`) and telemetry offsets (`telemStride = 1888`, `rearBrakeBias = 664`, `TC = 750`, `ABS = 756`, tyre pressures = `968/1228/1488/1748`) to match Studio 397's `InternalsPlugin.hpp` under `#pragma pack(push, 4)` byte-for-byte.
  - Enforced strict player resolution (`isPlayer == 1`) in `recorder/lmu_pages.go` and implemented session vehicle lock (`lockedID`) in `recorder/lmu_adapter_windows.go`, preventing AI traffic from hijacking player car metadata or splitting stints into fragmented CSV files.
- **Deduplication of AC EVO Results & Official Transponder PB Calibration**:
  - Resolved duplicate "Solo Tiempos" sessions generated when driving with the recorder in Assetto Corsa EVO: `CSVImporter` now links the matching `.sessionresults.json` (`resolve_acevo_session_info`), calibrating the flying lap's duration and sector splits to official in-game transponder times (e.g. 1:43.701) with full 50Hz telemetry traces.
  - Added database migration and storage deduplication: automatically eliminates bare `.sessionresults.json` entries (`duration == 0.0`) when a corresponding 50Hz `.csv` recording covers the same run.
  - Enforced incomplete/in-lap detection for sessions cut short before crossing the finish line, preventing unfinished pit returns from masquerading as valid flying laps.
- **Automatic Simulator Rescan & LMU Practice Lap Importer**:
  - Fixed LMU XML result parser in `importers/lmu_importer.py` to gracefully handle practice stints and unclassified laps marked with `--.----`, recovering elapsed time deltas and sector splits as valid out-laps instead of discarding the session with `no timed laps`.
  - Added background automatic rescan in `frontend/src/App.tsx` on application startup, on switching to the `/sessions` tab, and on window focus (alt-tabbing back from a driving session), automatically syncing new simulator runs without requiring backend restarts.
  - Added a manual **"Sincronizar Simuladores"** button with spinning refresh icon in `frontend/src/views/SessionsView.tsx` with localized feedback toasts.
- **Unified Track Canonical Normalization & Single Track Workspaces**:
  - Expanded `TRACK_ALIASES` and keyword fallback matching in `domain/session.py` to capture all permutations of `"redbull ring"`, `"Redbull Ring"`, `"redbull"`, `"red_bull_ring"`, and `"spielberg"`.
  - Added automatic database migration in `storage/database.py` that consolidates split session records (e.g. `Redbull Ring` and `Red Bull Ring`) into a single canonical workspace (`Red Bull Ring`), unifying telemetry recordings (50Hz CSVs) and simulator result files under the same circuit PB.
- **Descending Session/Lap Ordering & Detailed Timestamps in Workspace**:
  - Enhanced lap cards in `frontend/src/views/SessionsView.tsx` with human-readable time-of-day timestamps (`Hoy 21:29`, `25/10 21:23`) via `formatFileDateTime`, replacing raw date-only strings (`25/10/2026`).
  - Sorted workspace sessions and recorded laps strictly descending by session timestamp (`new Date(sessionDate).getTime()`), ensuring newly driven stints appear immediately at the top of the active workspace.
- **High-Fidelity Spotter Lead Times, Lap Wraps & Actionable GT3 Cues**:
  - Added distance-wrap lap reset in `recorder/spotter.go`: detects circuit wraps (`sample.LapDistance < prevDist - 2000.0`) resetting hotspot fired states on every lap, enabling continuous corner calls on flying laps even when simulators leave `CompletedLaps` unpopulated.
  - Reduced anti-overlap cooldown from 10.0s to 3.5s in `recorder/spotter.go`, preventing exit pace evaluations from suppressing the approach cues of subsequent corners.
  - Advanced hotspot lead times in `analysis/spotter.py` from 250m to 380m (~5.5s before braking at 240 km/h) and tailored actionable engineer calls referencing realistic track brake markers (150m, 100m, 50m boards), apex gears, and throttle application.
- **AC EVO Distance Tracking & Stateful Pit Detection**:
  - Fixed distance tracking in `recorder/pages.go` and `recorder/kunos_adapter_windows.go` falling through to speed integration when `normPos == 0.0` (zeroed in AC EVO) and sanitizing uninitialized coordinates and fluctuating lap counters.
  - Resolved spotter silence during laps in AC EVO: graphics shared memory (`Local\acevo_pmf_graphics`) shifts byte 1236 (`IsInPitLane`) inside `SMEvoElectronics`, reading non-zero dial settings and locking `InPit` to 1. Added stateful pit detection in `recorder/kunos_adapter_windows.go` and racing speed override (`SpeedKmh > 75.0`), allowing Pep to cleanly detect pit exit and announce hotspots and corner feedback throughout the entire lap.
  - Fixed CI test `TestSpotterCalibratedValenciaFlow` by isolating audio clip lookup with `t.TempDir()` in `recorder/spotter_test.go` and prioritizing `s.VoicesDir` in `recorder/spotter.go`, resolving failures on clean git checkouts where local `recorder/voices/tracks/` is gitignored.

### Added
- **AC EVO Track/Car Auto-Detection in Recorder & Spotter**:
  - Added fallback metadata scanner in `recorder/kunos_adapter_windows.go` that inspects `Saved Games/ACE/last_season.seasondefinition` when AC EVO leaves the static shared memory page empty, populating track and car names in live telemetry.
  - Added `redbull_ring` normalization matching `content\tracks\redbull_ring` in `recorder/spotter.go`, ensuring the live spotter immediately identifies the circuit, loads `manifest.json`, and guides drivers with authentic pit-wall calls instead of falling back to no-data cues.

### Added
- **AC EVO Binary Setup Decoder (`.carsetup`) & Garage Linking**:
  - Implemented proprietary Protobuf binary decoder for Assetto Corsa EVO `.carsetup` files (`importers/acevo_setup_loader.py`), reading static garage setup parameters (wings, ride heights, TC/ABS dials, ARBs, camber, toe, differential preload, cold tyre pressures) from `Saved Games/ACE/Car Setups/<Car>/<Track>/`.
  - Clarified garage setup linking across AC EVO and AC Rally/AC1 in `CarSetupInspector.tsx`, `CarSetupView.tsx`, `SessionsView.tsx`, `README.md`, and `AGENTS.md`. Instructs drivers that saving a setup in the in-game garage generates disk files (`.carsetup` / `.ini`), while driving on default settings keeps static garage parameters as `N/D` for technical honesty without affecting 50Hz dynamic physics telemetry.
- **Auto-Discovery Timestamp & Descending Date Sorting**:
  - Auto-discovery scanner (`/api/autodiscover`) returns file modification timestamps (`mtime`, `modified_at`).
  - Added formatted date chips with clock icons (`Hoy 16:39`, `Ayer 22:31`, etc.) and format badges (`50Hz CSV`, `MoTeC .ld`, `Resultados`, `SETUP`) in `SessionsView.tsx` sorted strictly newest-first.
- **Intervention Flag vs Dial Level Discrimination**:
  - Discriminated active physical intervention flags (`tc`, `abs` $\le 1.0$) in `SPageFilePhysics` from garage dial levels ($> 1.0$), preventing slip pulses from falsely displaying as `TC: 1` or `ABS: 1`.

### Added
- **Interactive Spotter Hotkey & Zero-Backend Turn Fallbacks**:
  - Interactive keybind modal in Settings (`⚙️ Ajustes`) allowing drivers to bind any keyboard key with automatic Windows Virtual-Key code (`toggle_vk_code`) mapping (F1-F12, Letters, Digits, Numpad, Navigation).
  - Persisted `toggle_key` and `toggle_vk_code` into `data/spotter_config.json` via `GET` / `PUT /api/spotter/config`, read natively at startup by `idoracing-recorder.exe` without requiring Python backend running.
  - Pre-generated static turn audio clips (`turn_1` .. `turn_20`) in Spanish and English versioned in Git (`recorder/voices/`), providing autonomous zero-backend fallbacks in `spotter.go` and Linux launch wrappers.
  - Configured `.gitignore` to ignore local user configurations `data/spotter_config.json` and generated sessions in `recorder/voices/tracks/`.
- **Authentic Pep Pit-Wall Radio & Manifest-Aware Cues**:
  - Overhauled all spotter dialogues in Spanish (`es-ES-AlvaroNeural`) and English (`en-GB-RyanNeural`) with authentic GT3 pit-wall engineer terminology and walkie-talkie bandpass filtering.
  - Manifest-aware pit exit and unmute cues: distinguishes whether track baseline references (`manifest.json`) are loaded (`radio_start_guided` / `radio_unmute_guided`) or telemetry is still logging (`radio_start_nodata` / `radio_unmute_nodata`).
  - Instant `radio_off` radio mute feedback on F9 hotkey and Web topbar toggle `[ 🎧 Radio: ON / OFF ]`, bypassing normal cooldowns.
  - Corner pace feedback with sequential Bubota roasts (`bubota_roast_01`..`03`), apex gain (`corner_gain`), overshoot corrections (`corner_overshoot`), and early braking warnings (`corner_early_brake`).
  - Dynamic hotspot audio generation template in `analysis/spotter.py` tuned to trail braking pit-wall calls.
- Mitigated compromised intermediate CAs vulnerability (eMudhra CAs CVE):
  - Updated Dockerfile multi-stage builds (`frontend-builder` Alpine and release Debian) to install and update system `ca-certificates`.
  - Pinned `certifi>=2026.10.19` in `requirements.txt` and `pyproject.toml` to revoke compromised root/intermediate CAs at Python SSL/TLS runtime.
  - Enforced `SSL_CERT_FILE` and `REQUESTS_CA_BUNDLE` pointing to `certifi.where()` at server startup (`api/server.py`), protecting host execution without Docker against unpatched OS certificate stores.
  - Audited dependencies with `pip-audit` and `npm audit` achieving 0 vulnerabilities across Python and Node ecosystems.
  - Configured ES2022 build target in `frontend/vite.config.ts`.
  - Upgraded Go runtime module directive to Go 1.26 in `recorder/go.mod` and verified with `govulncheck` reporting 0 vulnerabilities.

### Added
- **Live Setup & Tyre Telemetry in Recorder**: Expanded `idoracing-recorder` with 4-wheel dynamic tyre pressures (`pressure_fl`, `pressure_fr`, `pressure_rl`, `pressure_rr`), traction control (`tc`), anti-lock braking (`abs`), and brake bias (`brake_bias`) extracted in real time at 50Hz directly from Kunos shared memory (`physicsPage` and `graphicsPage`) into 23-column CSV session files.
- **AC EVO & AC Rally Telemetry & Setup Ingestion**:
  - Automatically captures live tyre pressures, TC, ABS, and Brake Bias for Assetto Corsa EVO and Assetto Corsa Rally without requiring exported setup files.
  - Sane lap number handling and bar-to-PSI conversion preventing offset displacements or corrupted negative lap counts from early access builds.
  - Fallback UTF-16LE string scanner in `decodeStatic()` preventing empty track/car metadata when Kunos adjusts page offsets.
- **ACC Steam Proton Setup Loader**: Automatically discovers and parses the player's active garage setup JSON file from Steam Proton prefixes (`992 ps_racing.json`) with true electronics, aero, ARBs, and differential preload.
- **Generic Normalization Engine**: Replaced hardcoded track/car name mappings with rule-based capitalization preserving technical acronyms (`GP`, `F1`, `GT1-4`, `LMGT3`, `RS`, `EVO`, `AMR`, `AMG`, `BMW`) and dynamic lap length estimation.
- **Last Session Ordering & Date Badges**: Session groups in `http://localhost:8501/#/sessions` now sort chronologically descending by `last_session_date`, placing the most recently played game/circuit at the top with a calendar date/time badge.
- **Red Bull Ring Spotter Voices**: Added bilingual (Spanish/English) audio cues and spotter manifest for Red Bull Ring.
- **Pep Live Spotter (Zero-Daemon Track Radio)**: in-game voice spotter that cues critical braking points 250m before corners, personal bests, tyre pressure warnings, and apex gain evaluation with 0% CPU/0% GPU overhead during race sessions.
- In-game pit-wall radio toggle via **F9** hotkey with authentic bilingual voice confirmations ("Idò, Pep al habla" / "Pep se va").
- Pre-recorded OGG track voice generator (`tools/generate_pep_voices.py`) and automatic spotter manifest export (`analysis/spotter.py`) based on delta deficit against Bubota.
- Generic, universal physics distance tracking (`distanceTracker` in `recorder/pages.go`) accumulating Euclidean ground displacement $(\Delta d = \sqrt{\Delta x^2 + \Delta y^2})$ and speed integration $(\int v \, dt)$ supporting both closed circuits and linear point A-to-B rally stages without pinned track lists.
- Regression tests for closed circuit loop closure and open point A-to-B rally stages (`TestDistanceTrackerRallyPointToPoint`, `TestDistanceTrackerClosedCircuit`, `test_rally_point_to_point_stage_vs_closed_circuit`).
- Automated Playwright visual regression test (`tests/test_header_visual.py`) verifying bounding box non-overlap across desktop (1080p) and laptop (1366x768) resolutions.
- Added automated documentation consistency test (`tests/test_docs_consistency.py`) and pre-commit hook validation ensuring all supported simulators and launch scripts are always documented across `README.md` and `recorder/README.md`.
- Expanded `README.md` with dedicated, comprehensive sections and an auto-discovery directory reference table for all 8 supported simulators (ACC, LMU, AC1, AC Rally, AC EVO, DR2, WRC, iRacing).
- Clarified Le Mans Ultimate shared memory setup with exact plugin folder requirements and configuration paths in root and recorder documentation.
- Documented complete Windows recording workflows (`shell:startup` background run, multi-sim auto-detection, `-exit-with` hooks) and Linux GameMode / MangoHud universal launcher syntax in root and recorder READMEs.
- Simulator badges & labels in Garaje and Sessions for all supported simulators (`ACC`, `LMU`, `iRacing`, `AC EVO`, `AC`, `AC RALLY`, `DR2`, `WRC`) with robust fallback detection.
- In-app guides and warning banners in Sessions and Garaje views explaining how to capture 50Hz telemetry (throttle, brake, steering, G-force, and GPS racing line) when laps only contain times ("⏱️ Solo Tiempos").
- Multi-prefix recorder auto-discovery in backend (`api/server.py`), automatically importing 50Hz CSV recordings from all Steam Proton compatdata prefixes and native Documents paths.
- Multi-simulator support expanded to **DiRT Rally 2.0** and **EA SPORTS WRC** via 100Hz Codemasters UDP telemetry stream (`dr2-with-recorder.sh`), capturing stage times, distance, inputs, G-forces, and point-to-point $(x, y)$ stage geometries.
- Added full support and in-app activation guides for **Assetto Corsa Rally** point-to-point stages alongside circuits using `ac-with-recorder.sh`.
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
- Hardened commit-msg hook to explicitly reject Co-Authored-By trailers.
- Updated Valencia demo track spotter audio cues and manifest with synthesized speech guidance for top deficit hotspots.
- Comprehensive documentation of Pep Live Spotter audio architecture, broadcast loudness mastering, Linux voice priority channel, and universal point-to-point rally stage support across root `README.md` and `recorder/README.md`.
- Hardened git pre-commit hook (`githooks/pre-commit`): automatically runs full pytest test suite, Go unit tests in `recorder/`, and frontend build verification before allowing commits.
- Remastered Pep spotter radio audio with broadcast loudness normalization (`loudnorm=I=-11:TP=-0.3:LRA=4`), speech presence boost (+5dB at 2.8kHz), highpass filter, and dedicated audio role/volume controls (`--volume`, `media.role=voice`) in launch scripts (`acc-with-recorder.sh`, `sim-with-recorder.sh`).
- Replaced hardcoded personal hardware IDs with standard XDG environment loader (`~/.config/idoracing/env`).
- Re-architected telemetry session context bar into responsive, fluid flex-wrap layout preventing car badge and P1 lap badge overlap.
- Redesigned AI engine chip (`.model-badge`) to compact single line (`⚙️ Reglas Numéricas` / `⚙️ qwen3.8:27b`) with translucent background.
- Compacted central navigation tabs and renamed Race Engineer tab to "Pep · Ingeniero" to prevent horizontal scrollbars across all viewports.
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
- Isolated spotter audio generation in test suite to a temporary directory via IDORACING_VOICES_DIR, preventing pytest from modifying working tree audio files in recorder/voices/tracks/valencia/.
- Added template audio fallback in spotter voice generator when ffmpeg is missing in CI environments.
- Handled missing `playwright` dependency gracefully in CI via `pytest.importorskip("playwright")`, preventing collection errors when running pytest without browser testing packages.
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
