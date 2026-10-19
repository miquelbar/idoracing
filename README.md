# IdoRacing Analytics 🏎️

> ### **Every lap tells a story.**
> **Multi-sim telemetry analysis. Built for faster laps.**

[![CI](https://github.com/miquelbar/idoracing/actions/workflows/ci.yml/badge.svg)](https://github.com/miquelbar/idoracing/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Python: 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![React: 19](https://img.shields.io/badge/react-19-cyan.svg)](https://react.dev/)
[![TypeScript: 6](https://img.shields.io/badge/typescript-6-blue.svg)](https://www.typescriptlang.org/)
[![Ollama: Ready](https://img.shields.io/badge/ollama-qwen3.8%3A27b--32k-orange.svg)](https://ollama.ai/)

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
- **Honest about the data**: when a file only carries lap times, the traces are simulated and the app says so on screen (see [Synthetic telemetry](#-synthetic-telemetry)).

---

## 🌟 Key Features

### 1. 🗺️ Track map with speed delta
- Lap outline coloured by the speed difference between the two laps.
- Click any corner on the map to open its analysis.
- Valencia (Ricardo Tormo) and Sebring have hand-made corner tables; Sebring's outline comes from OpenStreetMap. On any other track, corners are detected from dips in the speed trace and the outline is dead-reckoned from speed and lateral acceleration, or taken from GPS / world-position channels when the log has them.

![IdoRacing Analytics Telemetry Dashboard](docs/screenshots/telemetry-overview.png)

### 2. 🔍 Corner-by-corner inspector
- **Phase table** comparing reference and your lap for each corner: braking point, brake pressure into the apex, minimum speed and gear, throttle pick-up after the apex, and exit speed.
- **Diagnosis** per corner (early braking, early release of the brake, early apex, traction-limited exit...) from fixed thresholds on those numbers.
- **Corner diagram**: a schematic picture of the line the diagnosis suggests. It is an illustration, not your measured trajectory.
- **Ask Pep** about the selected corner in one click.

![Corner Phase Performance Analysis](docs/screenshots/corner-phase-analysis.png)

### 3. 📈 Distance-aligned traces
- Speed, cumulative time delta, throttle and brake (with the trail-braking overlap), and gear, resampled every 2 m so both laps line up.
- Hovering any chart moves a shared cursor across all of them and the map.

### 4. 🤖 Pep, the AI race engineer
- Pep (Performance Engineering Partner, and a nod to IdoRacing's Mallorcan origins) is your pit-wall engineer.
- Debrief report and radio chat about your laps, in Spanish or English.
- **Local (Ollama)** or **cloud** (any OpenAI-compatible API: OpenAI, OpenRouter, DeepSeek...).
- The prompt carries the corner numbers and tells the model not to invent data; nothing checks the model's answer against them afterwards.
- **Rule-based fallback**: when no LLM answers, Pep replies with canned explanations picked by keyword and filled with your corner numbers. The UI shows which engine answered and the report's confidence drops to *Baja* on synthetic telemetry.

### 5. 🗄️ Sessions and lap history
- Switch between imported sessions, compare any two laps, and see each lap's gap to your personal best.
- A demo session (generated laps at Valencia) to explore the app before importing anything.

### 6. 📂 Import
- **Auto-discovery** of the default ACC and LMU folders under Steam / Proton on Linux.
- **Upload** `.ld` (MoTeC), `.xml` (LMU results) or `.csv` files from the web UI. Laps are cut from the `.ldx` markers when the `.ld` is imported from its folder, or from lap-distance resets when only the `.ld` is uploaded.

### 🧪 Synthetic telemetry
LMU result files contain lap and sector times, not traces. For those laps (and for the demo session) the app generates placeholder traces from the track's corner table, scaled to each lap time, and shows a warning banner above the charts. The corner diagnosis on those laps is a simulation and should not be read as feedback on your driving.

---

## 🎮 How to Record Telemetry in Your Sim

### 🏎️ Assetto Corsa Competizione (ACC)
1. Load into the track and enter the **Car Setup** menu.
2. Go to the **Electronics** or **Fuel & Strategy** tab.
3. Look for the **Telemetry Laps** setting and increase it to **10–20 laps** (default is `0` = disabled).
4. Complete your laps and return to the pit box. ACC will save `.ld` and `.ldx` files to:
   - **Windows**: `Documents\Assetto Corsa Competizione\MoTeC\`
   - **Linux (Proton)**: `~/.local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents/Assetto Corsa Competizione/MoTeC/`

### 🏁 Le Mans Ultimate (LMU)
1. LMU logs race and practice session data automatically in XML format upon exiting the session.
2. Files are located in:
   - **Windows**: `<SteamLibrary>\steamapps\common\Le Mans Ultimate\UserData\Log\Results\`
   - **Linux (Steam)**: `~/.local/share/Steam/steamapps/common/Le Mans Ultimate/UserData/Log/Results/`
3. IdoRacing Analytics auto-detects these XML session files and imports your lap times and sector deltas instantly.

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
ollama pull qwen3.8:27b-32k
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
| `OLLAMA_MODEL` | `qwen3.8:27b-32k` | Local model name (e.g., `qwen3.8:27b-32k`, `qwen3:14b`) |
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
