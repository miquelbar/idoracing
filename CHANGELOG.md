# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-18

### Changed
- Rebranded project to **SimCoach**, broadening support to multiple racing simulators (Assetto Corsa Competizione, Le Mans Ultimate, iRacing).
- Transformed interface into an interactive **Formula 1-Style Telemetry Suite**:
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
