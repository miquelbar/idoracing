# Contributing to IdoRacing Analytics

Thank you for your interest in contributing to IdoRacing Analytics!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/miquelbar/idoracing.git
   cd idoracing
   ```

2. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. Run the automated tests:
   ```bash
   pytest
   ```

4. Launch the local development server:
   ```bash
   streamlit run app.py
   ```

## Guidelines

- **Reproducibility**: Numerical analysis and telemetry calculations must be completely deterministic and verifiable.
- **Privacy & Security**: Never transmit telemetry data or logs to external third-party cloud services.
- **Testing**: Add unit tests for any new features, parsers, or metric calculations.
- **Code Style**: Follow PEP 8 guidelines and keep dependencies minimal.
