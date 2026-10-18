# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-18

### Added
- MoTeC `.ld` binary parser and `.ldx` XML lap markers reader for Assetto Corsa Competizione.
- CSV telemetry importer supporting standard ACC and MoTeC channel structures.
- Realistic synthetic session generator for Porsche 911 GT3 R (992) at Circuit Ricardo Tormo (Valencia, 4005m).
- Distance-based telemetry alignment and continuous cumulative time delta ($\Delta t$) profiling.
- Corner-by-corner analysis (minimum speed/apex, braking points, throttle pickup, time loss diagnostics).
- Local AI Coach integration with Ollama (tested with `qwen3:14b` and `qwen3.8:27b-32k`), including deterministic analytical fallback when AI is disabled.
- Interactive Streamlit dashboard with 6 pages: Dashboard, Import, Laps, Comparator, AI Coach, and Settings.
- SQLite persistence layer for sessions, segmented laps, and generated coaching reports.
- Dockerfile with non-privileged user and healthcheck, plus Docker Compose with Linux host gateway access for Ollama.
- Automated test suite with 22 unit and integration tests.
- GitHub Actions CI workflow.
