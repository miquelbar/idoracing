# SimCoach 🏎️

[![CI](https://github.com/miquelbar/acc-coach/actions/workflows/ci.yml/badge.svg)](https://github.com/miquelbar/acc-coach/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)

**SimCoach** is a universal, local, privacy-first telemetry analysis suite and AI-assisted driving coach for SimRacing:
- **Assetto Corsa Competizione (ACC)**
- **Le Mans Ultimate (LMU)**
- **iRacing** (MoTeC & CSV exports)

It runs natively on Linux (optimized for Arch Linux) and via Docker, providing deterministic physical telemetry comparison, Formula 1-style overlays, and local AI coaching with zero cloud data transmission.

---

## 🎯 Key Features

1. **Multi-Simulator Ingestion**:
   - **MoTeC .ld & .ldx**: Binary decoding of MoTeC telemetry channels, calibration formulas, and XML split/lap markers (ACC, LMU, rFactor 2).
   - **Le Mans Ultimate Sessions**: Direct parsing of LMU session XML logs (`UserData/Log/Results`).
   - **CSV & Third-Party Logs**: Universal CSV importer for iRacing (Mu/Atlas exports) and custom logging setups.
   - **Auto-Detection**: Automatic discovery of telemetry folders under Steam Proton on Linux.
2. **Formula 1-Grade Overlay & Analysis**:
   - **2D Track Ribbon & Speed Heatmap**: Dynamic track layout computed via velocity and lateral acceleration integration, with continuous speed delta ($\Delta V$) color gradients.
   - **Timing Tower & Micro-Sectors**: F1-style live gap breakdown and S1/S2/S3 timing deltas.
   - **Segment & Corner Breakdown**: Instant zoom into any of the 14 track corners with dedicated telemetry metrics (braking point delta, apex minimum speed $V_{min}$, and throttle pick-up distance).
3. **Synchronized Telemetry Stack**:
   - Speed with apex indicators.
   - Cumulative time delta ($\Delta t$) with dynamic positive/negative area fills.
   - Throttle & Brake pedal inputs with shaded overlap for trail braking analysis.
   - Gear shifts and engine RPM.
4. **Local AI Race Engineer (Ollama)**:
   - Connects to your locally hosted Ollama instance (e.g. `qwen3:14b`, `qwen3.8:27b-32k` with CUDA acceleration).
   - Grounded exclusively in verified telemetry facts and calculated metrics (zero hallucinations).
   - 5 structured sections: Observed facts, supporting metrics, technical driving hypotheses, targeted track exercises, and verification indicators.
   - **Deterministic Fallback**: Runs full analytical rule engine when Ollama is offline or disabled.
5. **Privacy First**: 100% offline and local. Telemetry and logs never leave your hardware.

---

## 🏗️ Architecture

```
simcoach/
├── domain/             # Pydantic v2 domain models (Session, Lap, LapComparison, CoachReport)
├── importers/          # Multi-sim ingestion: MoTeC .ld/.ldx, LMU XML, CSV, synthetic generator
├── analysis/           # Distance alignment, delta time profiling, corner detection
├── storage/            # Local SQLite database for sessions, laps, and reports
├── coach/              # Local Ollama client & technical race engineer advisor
├── ui/                 # Streamlit F1-style suite and Plotly visualizations
├── tests/              # Comprehensive automated pytest suite
├── Dockerfile          # Container image with non-privileged user
├── compose.yaml        # Docker Compose with Linux host Ollama gateway
└── pyproject.toml      # Build metadata and quality configuration
```

---

## 🚀 Quickstart

### Option A: Local Python Environment (Recommended)

1. **Activate virtual environment & install dependencies:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Launch SimCoach:**
   ```bash
   streamlit run app.py
   ```
   Open your browser at:
   - Local: `http://localhost:8501`
   - Local Network (LAN): `http://localhost:8501`

---

### Option B: Docker Compose

1. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```

2. **Run:**
   ```bash
   docker compose up --build
   ```
   Access at `http://localhost:8501` or `http://localhost:8501`.

---

## 🧪 Automated Testing

Run the full test suite with `pytest`:

```bash
source .venv/bin/activate
PYTHONPATH=. pytest -v
```

All 24 unit and integration tests validate binary parsers, XML session ingestion, distance alignment, corner detection, SQLite persistence, and Ollama integration.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
