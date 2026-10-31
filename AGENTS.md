# IdoRacing Analytics — Agent Guidelines & Repository Rules

Este documento define las reglas de desarrollo, arquitectura y buenas prácticas obligatorias para cualquier agente de IA (Antigravity, Cursor, Claude, etc.) que trabaje en este repositorio.

---

## 1. Reglas de Git y Manejo de Archivos Generados en Pista

### ⚠️ Regla de Oro: `recorder/voices/tracks/` y `data/spotter_config.json` son estrictamente locales
- **NUNCA hagas `git checkout` ni `git add` sobre archivos dentro de `recorder/voices/tracks/` ni sobre `data/spotter_config.json`**.
- La carpeta `recorder/voices/tracks/` contiene los audios de hotspots y manifiestos de circuito (`manifest.json`) generados dinámicamente según las vueltas y telemetría de cada usuario local.
- `data/spotter_config.json` almacena las preferencias locales del usuario (idioma, volumen, tecla de mute).
- Ambos están incluidos en `.gitignore`. Si alguna vez aparecen en el índice de Git, deben removerse con `git rm -r --cached recorder/voices/tracks/`.
- **Aislamiento en Tests**: Los tests unitarios (`pytest`) deben aislar la generación de audios en un directorio temporal (`tempfile.mkdtemp()`) mediante la variable de entorno `IDORACING_VOICES_DIR`, tal como está implementado en `tests/conftest.py`. **Nunca permitas que los tests escriban en el árbol de trabajo de Git**.

### Audios Base Versionados (Offline / Sin Backend)
- Los clips de audio base en `recorder/voices/es/` y `recorder/voices/en/` (incluyendo `turn_1`..`turn_20` para fallbacks autónomos de curvas) **SÍ se versionan en Git**.
- Esto garantiza que el ejecutable `idoracing-recorder.exe` funcione al 100% en pista con Pep hablando por radio incluso con el backend apagado.

---

## 2. Fidelidad de Telemetría y Configuración de Coches (`/setup`)

### Honestidad Técnica: Cero Datos Inventados
- **Assetto Corsa Competizione (ACC)**: Es el único simulador que exporta archivos completos de setup de garaje a disco (`.json` en `Documents/Assetto Corsa Competizione/Setups/<coche>/<circuito>/`). Cuando se carga una sesión de ACC, `load_acc_setup()` lee el archivo real y se muestra el 100% de los parámetros mecánicos con `has_garage_setup = True`.
- **Assetto Corsa EVO (AC EVO - Early Access v0.9) & AC Rally / AC1**:
  - **Formato propietario binario (`.carsetup`) en AC EVO / `.ini` en AC Rally & AC1**: AC EVO guarda los setups de garaje en formato binario `.carsetup` en `Saved Games\ACE\Car Setups\<Car>\<Track>\`. AC1 y AC Rally los guardan en `.ini` en `Documents\Assetto Corsa\setups\`.
  - **Requisito de Guardar Setup en Garaje**: Si el usuario rueda con el setup de serie (por defecto) sin pulsar "Guardar Setup" en el garaje del juego, Kunos **no crea ningún archivo en disco**. La carpeta `Car Setups/` no existirá hasta que se guarde el primer setup.
  - **Shared Memory sin reglajes mecánicos estáticos**: La memoria compartida de Kunos (`SPageFilePhysics` / `SPageFileStatic`) emite física en vivo (velocidad, RPM, marchas, fuerzas G, recorrido de suspensión `suspensionTravel[4]`, presiones y temperaturas dinámicas de neumáticos, reparto de frenada `brakeBias`), pero **no expone los reglajes mecánicos estáticos del garaje** (muelles, barras estabilizadoras ARB, amortiguadores, caídas o alturas).
  - **Honestidad Técnica**: Para obtener y vincular la telemetría completa de setup de garaje (alerón, alturas, diales de TC/ABS y caídas), el usuario **debe guardar un setup en el simulador**. Todo parámetro mecánico no guardado que la memoria compartida no expone debe mostrarse como **`N/D`** (No Disponible) con `has_garage_setup = False`, indicando al usuario en la UI cómo guardarlo. La telemetría física real a 50Hz de pista (neumáticos, presiones y pedales) permanece activa al 100%. Nunca inventes valores ni baselines ficticios para sesiones reales de AC EVO o AC Rally.
- **Flags de Intervención vs. Niveles de Dial (TC y ABS)**:
  - En la memoria compartida de Kunos (`SPageFilePhysics`), los canales `tc` y `abs` son **flags de intervención física** (valen `0.0` o `1.0` en los instantes en que el ABS pulsa o el TC corta potencia).
  - **NUNCA interpretes un valor `1.0` de intervención como el nivel de reglaje del coche (`TC: 1` o `ABS: 1`)**. Si el rango del canal es `<= 1.0`, debe tratarse como intervención en pista y no asignarse al dial de garaje.
- **Le Mans Ultimate (LMU) & rFactor 2 Shared Memory Architecture**:
  - **Plugin Oficial Requerido**: LMU utiliza `Plugins/rFactor2SharedMemoryMapPlugin64.dll` (activado en `UserData/player/CustomPluginVariables.JSON` con `" Enabled": 1`), el cual publica la física viva en `$rFactor2SMMP_Telemetry$` y el scoring en `$rFactor2SMMP_Scoring$`.
  - **Prioridad Absoluta de Shared Memory**: El grabador (`idoracing-recorder.exe`) **debe conectarse siempre prioritariamente a `$rFactor2SMMP_Telemetry$` y `$rFactor2SMMP_Scoring$`**. Nunca debe interceptarse la conexión con la memoria interna `LMU_Data` (que requiere semáforos de sincronización mutex de Studio 397 no emitidos por defecto).
  - **Resolución Obligatoria del Vehículo del Jugador (`mIsPlayer == 1`)**: En parrillas multivehículo (WEC / multicategoría), el índice 0 del buffer suele ser un coche de la IA. El grabador debe escanear el buffer de scoring para encontrar `mIsPlayer == 1` o coincidencia con `mPlayerName`, extraer su `mID`, y emparejarlo en `$rFactor2SMMP_Telemetry$` para grabar únicamente la telemetría del coche del jugador.
  - **Mapeo de Memoria Completo**: `MapViewOfFile` debe llamarse con tamaño `0` para mapear el buffer completo del proceso y no truncar arrays multivehículo (no usar límites fijos de 16KB).
  - **Deduplicación de Sesiones XML vs. CSV**: Los archivos de resultados `.xml` en `UserData/Log/Results/` solo deben deduplicarse contra un `.csv` de 50Hz si coinciden por `linked_result_file` explícito o están en una ventana de proximidad realista (< 15 minutos / 900s), nunca ventanas de horas que descarten tandas posteriores.

---

## 3. Protocolo de Commits y Verificación

### Prohibido Commit Automático y Prohibido `--no-verify`
- **NUNCA ejecutes `git commit` ni `git push` automáticamente**.
- **NUNCA uses `--no-verify` en `git commit` ni en `git push`**. Los hooks `githooks/pre-commit` y `githooks/pre-push` replican al 100% el pipeline `.github/workflows/ci.yml` para garantizar que jamás suba un commit que falle en la CI de GitHub.
- Tras implementar y verificar cualquier tarea:
  1. Ejecuta la suite de verificación completa (idéntica a `.github/workflows/ci.yml`):
     - `.venv/bin/ruff check . && .venv/bin/ruff format --check .` (Python lint & format)
     - `.venv/bin/pytest tests/` (Python unit & integration tests)
     - `cd recorder && go test ./... && bash linux/test-acc-with-recorder.sh && bash linux/test-sim-launchers.sh && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w -H=windowsgui" -o /tmp/idoracing-recorder-ci.exe . && rm -f /tmp/idoracing-recorder-ci.exe` (Go tests, Linux launcher scripts & Windows cross-compilation)
     - `npm run build --prefix frontend && npm run lint --prefix frontend` (Vite / TypeScript build & oxlint)
  2. Muestra un resumen ejecutivo al usuario con:
     - Archivos modificados (`git status -s`).
     - Explicación concisa de la solución.
     - Propuesta de commit siguiendo **Conventional Commits** (`feat:`, `fix:`, `refactor:`, etc.) sin trailers `Co-authored-by`.
  3. **Detente y pide permiso explícito al usuario antes de hacer commit**.
