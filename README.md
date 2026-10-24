# IdoRacing Analytics 🏎️

> ### **Every lap tells a story.**
> **Multi-sim telemetry analysis. Built for faster laps.**

[![CI](https://github.com/miquelbar/idoracing/actions/workflows/ci.yml/badge.svg)](https://github.com/miquelbar/idoracing/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Python: 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![React: 19](https://img.shields.io/badge/react-19-cyan.svg)](https://react.dev/)
[![TypeScript: 6](https://img.shields.io/badge/typescript-6-blue.svg)](https://www.typescriptlang.org/)
[![Ollama: Ready](https://img.shields.io/badge/ollama-qwen3.8%3A27b-orange.svg)](https://ollama.ai/)

**IdoRacing Analytics** is an open-source telemetry viewer and AI race engineer for sim racers. It lines up two of your laps by distance, shows where the time goes corner by corner, and explains it in plain words, either with a local LLM through Ollama or with a rule-based fallback.

![IdoRacing Analytics Interactive Walkthrough](docs/screenshots/idoracing-demo.gif)

Supports:
- **Assetto Corsa Competizione (ACC)**
- **Le Mans Ultimate (LMU)**
- **iRacing** (MoTeC & CSV exports)
- **Universal CSV Logs**

---

## 💡 The Philosophy

- **Free and open source**: runs on your PC or home network, no accounts or paywalls.
- **Local by default**: telemetry and sessions stay in a SQLite file on your machine. Nothing leaves it unless you configure a cloud LLM provider (the web UI also loads its fonts from Google Fonts).
- **100% Data Honesty**: real sessions that only contain lap/sector times (e.g. ACC with `Telemetry Laps = 0` or LMU XML results without a `.ld` file) **never invent or interpolate fake telemetry charts or corner diagnoses**. Instead, the app displays the real timed splits and a step-by-step telemetry activation guide for that simulator. Synthetic telemetry is strictly limited to the explicit **`[ Load Valencia Demo ]`** button.

### 🏝️ The Name & Identity: Why "IdoRacing", "Pep", and "Bubota"?

- **IdoRacing (from *"Idò!"*, not *"I do"*)**: pronounced `/iˈðɔ/` (with the stress on the *ò*), **"Idò"** is the quintessential word from **Mallorca (Balearic Islands, Spain)**. Depending on tone, it means *"Well then!"*, *"So..."*, *"Of course!"*, or *"Let's get to it!"*. When a race engineer looks at your telemetry trace and spots where those three tenths went, the analysis always starts with: *"Idò, look at your braking point in Turn 1..."*
- **Pep — Your AI Race Engineer**: **Pep** is a classic traditional Mallorcan name—and in IdoRacing Analytics, he is your local AI race engineer on the pit wall (**P**erformance **E**ngineering **P**artner). Grounded 100% in physics and verified telemetry metrics, Pep skips generic fluff and tells you directly what happened in `P1` vs `P2`.
- **Bubota — The Ideal Physics Ghost**: In Mallorcan folklore, a ***bubota*** is a ghost. In telemetry analysis, comparing two of your own laps (`P1` vs `P2`) has a blind spot: *what if you made the exact same braking or line mistake on both laps?* **Bubota** (**B**enchmark **U**ltimate **B**raking & **O**ptimal **T**rajectory **A**nalyzer) is the theoretical physics ghost that projects the optimal trail-braking release, apex minimum speed, and throttle ramp for your car's real grip limit, showing how much lap time is still on the table even against your Personal Best.

---

## 🌟 Key Features

### 1. 🗺️ Track map & 50Hz Telemetry Channels (`P1` vs `P2` vs `👻 Bubota`)
- Lap outline coloured by the speed difference between `REF · P1` (Cyan) and `COMP · P2` (Purple).
- **👻 Bubota (Ideal Physics Ghost)**: computes your **Rolling Best (Optimal Lap)** and physical limit envelope ($a_{y,\max}$, optimal diagonal trail braking regression `100% -> 0%` at apex, and progressive throttle pickup), drawing golden dashed `--- 👻 Bubota (Ideal)` curves on Speed and Pedals.
- Click any corner on the map or top bar (`T1`..`T14`) to zoom into its trajectory and phase breakdown.

![IdoRacing Analytics Telemetry Dashboard](docs/screenshots/telemetry-overview.png)

### 2. 🔍 Corner-by-corner Phase Diagnosis & Optimal Line
- **Explicit Lap Identification (`REF · P1 (V2)` vs `COMP · P2 (V4)` vs `👻 Bubota`)**: every table header, badge, and improvement bullet explicitly cites which lap is being diagnosed—including cross-session dates (`P1 (V2 · 19/10)`) and shared faults (`⚠️ Fallo en P1 y P2 (👻 Bubota: >55%)`).
- **2D Optimal Line Inspector**: compares `P1 (V2)` and `P2 (V4)` apex markers with non-overlapping coordinates and lateral line offset in metres.
- **Ask Pep** about the selected corner in one click.

![Corner Optimal Racing Line](docs/screenshots/corner-optimal-line.png)

![Corner Phase Performance Diagnosis](docs/screenshots/corner-phase-diagnosis.png)

### 3. 🗄️ Cross-Session Garage & Normalized Workspace
- **Canonical Car & Track Normalization**: unifies internal simulator IDs (`porsche_992_gt3_r`, `992 GT3 R`) under their official name (**`Porsche 911 GT3 R (992)`**, **`Ricardo Tormo de Valencia`**).
- **Cross-Session Lap Comparison**: view all historical laps across all sessions of a `[Circuit + Car]` in a single workspace, filter by session date, see **`📈 Telemetría 50Hz`** vs **`⏱️ Solo Tiempos`** badges, and click **`[ 🏆 Usar PB Histórico como Ref P1 ]`** to compare today's stint against your all-time personal best.

![Sessions & Garage Cross-Session Workspace](docs/screenshots/sessions-workspace.png)

### 4. 🤖 Pep · AI Race Engineer & Team Radio
- **Pep (`PEP · AI RACE ENGINEER & RADIO`)** is your pit-wall race engineer, delivering structured debriefs, setup recommendations, and live team radio answers in Spanish or English.
- **Strict Mathematical Coherence**: `delta = comp - ref`, trail braking `< 25%` is flagged as abrupt release (`Suelta brusca`), and zero false praise is ever given when losing time or apex speed.
- **Local (Ollama)** or **cloud** (any OpenAI-compatible API: OpenAI, OpenRouter, DeepSeek...), with an instant deterministic rule-based engine when offline.

---

## 🎮 How to Record Telemetry in Your Sim

### 🏎️ Assetto Corsa Competizione (ACC)

#### Option 1: Automatic Live Recorder (Recommended)
IdoRacing includes [`idoracing-recorder`](recorder/README.md), a lightweight background helper that reads ACC's shared memory under Proton/Wine. It captures full telemetry **including real world coordinates $(x, y)$** and ACC lap validity flags.

- **Linux (Steam + Proton)**:
  1. In Steam, go to **Assetto Corsa Competizione > Properties > General > Launch Options**.
  2. Add the launcher script before `%command%`:
     ```text
     /path/to/idoracing/recorder/linux/acc-with-recorder.sh %command%
     ```
     *(If using custom environment variables or GameMode, keep them before the script and command, e.g. `PROTON_ENABLE_NVAPI=1 /path/to/.../acc-with-recorder.sh gamemoderun %command%`)*
  3. Start ACC. The recorder runs silently in the background and closes automatically when the game exits.
  4. Sessions are saved directly to `IdoRacing/recordings/` and appear automatically in the app under **Auto-discovery**.

- **Windows**:
  Run `idoracing-recorder.exe -exit-with AC2-Win64-Shipping.exe` in the background.

#### Option 2: Native MoTeC Export (Fallback)
1. In ACC, enter the **Car Setup** menu for your vehicle.
2. Under **Electronics** or **Fuel & Strategy**, set **Telemetry Laps** to **10–20** (default is `0` = off).
3. Return to the pit box to flush files. ACC writes `.ld` and `.ldx` files to:
   - **Windows**: `Documents\Assetto Corsa Competizione\MoTeC\`
   - **Linux (Proton)**: `~/.local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents/Assetto Corsa Competizione/MoTeC/`
   *(Native MoTeC files lack world $(x, y)$ coordinates, so track maps are dead-reckoned).*

### 🏁 Le Mans Ultimate (LMU)

#### Option 1: Automatic Live Recorder (Recommended)
Like ACC, IdoRacing's [`idoracing-recorder`](recorder/README.md) captures LMU telemetry in real time, including **track position $(x, y)$**, pedals, steering, speed, and lateral/longitudinal G-forces at 50Hz.

- **Linux (Steam + Proton)**:
  1. In Steam, go to **Le Mans Ultimate > Properties > General > Launch Options**.
  2. Add the launcher script before `%command%`:
     ```text
     /path/to/idoracing/recorder/linux/lmu-with-recorder.sh %command%
     ```
  3. Start LMU. The recorder joins the game's Proton prefix, reads `$rFactor2SMMP_Telemetry$` and `$rFactor2SMMP_Scoring$`, and stops automatically when the game exits.
  4. Recordings go directly to `IdoRacing/recordings/` and appear automatically in the app under **Auto-discovery**.

- **Windows**:
  Run `idoracing-recorder.exe -sim lmu -exit-with "Le Mans Ultimate.exe"` in the background.

#### Option 2: Session Results XML / MoTeC DAMPlugin (Fallback)
1. LMU logs race and practice session results automatically in XML format upon exiting:
   - **Windows**: `<SteamLibrary>\steamapps\common\Le Mans Ultimate\UserData\Log\Results\`
   - **Linux (Steam)**: `~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results/`
2. IdoRacing Analytics auto-detects these XML session files and imports your lap times and sector deltas instantly.
3. If using DAMPlugin, place or upload the generated `.ld` file from `UserData/Log/MoTeC/` to view traces.

### 🏎️ Assetto Corsa, AC Rally & Assetto Corsa EVO
- **Assetto Corsa 1 & AC Rally**: Use `recorder/linux/ac-with-recorder.sh %command%` in Steam for real-time 50Hz capture across circuit and rally stages.
- **Assetto Corsa EVO**: Set **Telemetry Laps > 0** in the garage menu for `.ld` files, or use `recorder/linux/acevo-with-recorder.sh %command%` in Steam.

### 🌲 DiRT Rally 2.0 & EA SPORTS WRC
1. Enable UDP output in `hardware_settings_config.xml` (`<udp enabled="true" extradata="3" ip="127.0.0.1" port="20777" delay="1" />`).
2. Add `recorder/linux/dr2-with-recorder.sh %command%` to Steam Launch Options.
3. Captures stage run times, distance, speed, inputs, G-forces, and $(x, y)$ stage geometry automatically.

### 🏁 iRacing
1. While in the car, press **`Alt + L`** to start/stop telemetry recording (or set automatic logging in iRacing Options).
2. Telemetry `.ibt` files are written to `Documents\iRacing\telemetry\`.
3. Export to `.ld` (using the free MoTeC iRacing plugin) or export as CSV via Mu / Atlas.
4. Drag and drop the resulting `.ld` or `.csv` file into IdoRacing Analytics.

---

## 🏗️ Architecture

```
idoracing/
├── api/                # FastAPI app: REST endpoints and the built frontend
├── frontend/           # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/components/ # Charts, track inspector, debrief drawer
│   ├── src/views/      # Sessions, telemetry, lap history, engineer, settings
│   ├── src/services/   # Typed API client
│   └── src/types/      # API types
├── domain/             # Pydantic models (Session, Lap, LapComparison, CoachReport)
├── importers/          # MoTeC .ld/.ldx, LMU XML results and CSV importers
├── analysis/           # Alignment, corner analysis, lap comparison, track geometry,
│                       # placeholder telemetry and the demo session
├── storage/            # SQLite persistence for sessions, laps and debriefs
├── coach/              # LLM clients, prompts and the rule-based engineer
└── tests/              # pytest suite
```

---

## 🚀 Quickstart

### Option A: Local Python & Node (Recommended)

#### 1. Prerequisites
- Python 3.11+
- Node.js 20+ and npm

#### 2. Clone & Setup Backend
```bash
git clone https://github.com/miquelbar/idoracing.git
cd idoracing

# Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

#### 3. Build Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

#### 4. (Optional) Setup Local AI with Ollama
If you want free, 100% private AI race coaching:
```bash
# Install Ollama (https://ollama.ai)
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model (any Ollama chat model works; set OLLAMA_MODEL to its tag)
ollama pull qwen3.8:27b
```
*(Alternatively, configure an OpenAI-compatible API key in the web app under **Ajustes IA** / **AI Settings**, or in `.env`.)*

#### 5. Launch IdoRacing Analytics
```bash
source .venv/bin/activate
uvicorn api.server:app --host 127.0.0.1 --port 8501
```

Open your browser at `http://localhost:8501`.

The API has no authentication. Binding to `0.0.0.0` makes it reachable from your LAN, including the settings endpoint that holds your cloud API key; only do that on a network you trust.

---

### Option B: Docker Compose

1. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

2. **Launch with Docker Compose:**
   ```bash
   docker compose up --build
   ```

3. Access the web app at `http://localhost:8501`.

---

## 🧪 Testing & Code Quality

```bash
pip install -r requirements.txt ruff
pytest
ruff check . && ruff format --check .

cd frontend && npm ci && npm run build && npm run lint
```

There are no frontend tests yet; `npm run build` type-checks the app in strict mode.

---

## 🛠️ Configuration (.env)

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | AI Provider: `ollama` or `openai` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `qwen3.8:27b` | Local model name (e.g., `qwen3.8:27b`, `qwen3:14b`) |
| `OLLAMA_TIMEOUT` | `90.0` | Timeout in seconds for AI response generation |
| `OPENAI_API_KEY` | *(empty)* | Optional API key for OpenAI / OpenRouter / DeepSeek |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Optional endpoint (use `https://openrouter.ai/api/v1` for OpenRouter) |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model name when using OpenAI provider |
| `AI_ENABLED` | `true` | Enable or disable AI coaching functionality |
| `IDORACING_DB_PATH` | `data/idoracing.db` | Local SQLite database file path |

---

## 🤝 Contributing

Contributions are warmly welcome! Whether you are:
- Adding support for new simulators (Automobilista 2, EA Sports WRC, BeamNG)
- Enhancing corner detection algorithms or tire slip angle calculations
- Improving the UI or adding new telemetry charts
- Reporting bugs or suggesting features

Feel free to open an issue or submit a pull request. Please check [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

---

## 📄 License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

The MoTeC `.ld` reader in `importers/motec_binary.py` is based on the file layout documented by [gotzl/ldparser](https://github.com/gotzl/ldparser) (GPL-3.0). The Sebring centreline in `data/circuits/sebring.json` is derived from OpenStreetMap data, © OpenStreetMap contributors, available under the [Open Database License](https://opendatacommons.org/licenses/odbl/). See [NOTICE](NOTICE) for details.

Enjoy faster laps and cleaner racing! 🏁
