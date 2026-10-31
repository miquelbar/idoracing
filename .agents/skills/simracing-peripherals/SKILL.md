---
name: simracing-peripherals
description: >-
  Expert Simracing Peripheral & Hardware Telemetry Diagnostic guide (Gamepad, Direct Drive / Belt
  Cockpit Wheels, Load-Cell vs Potentiometer Pedals, and Keyboard). Maps 50Hz telemetry anomalies
  (brake release cliffs, parasitic pedal drag, FFB clipping over-rotation, thumbstick sawtoothing,
  speed-sensitivity lock clamping) to concrete hardware calibration, in-game gamma/filter settings,
  and peripheral-adapted driving drills.
---

# Simracing Peripherals & Telemetry Hardware Diagnostics Skill (IdoRacing)

This skill equips AI agents and **Pep (Race Engineer)** with the methodology to diagnose peripheral-level hardware and configuration issues directly from 50Hz telemetry traces (`brake`, `throttle`, `steer_angle`, `lat_accel`, `excess_steer_deg`, `steer_to_g`) across **Assetto Corsa Competizione (ACC)**, **Le Mans Ultimate (LMU)**, **Assetto Corsa EVO**, **Assetto Corsa Rally**, and **iRacing**.

---

## 1. Technical Honesty & Inclusive Peripheral Principle

1. **No Raw USB Device ID in Shared Memory**:
   - Simulator physics pages (`SPageFilePhysics`, `$rFactor2SMMP_Telemetry$`, MoTeC `.ld`) export normalized post-filter inputs (`brake` `0.0–1.0`, `throttle` `0.0–1.0`, `steer_angle` in degrees), not whether the input came from a Direct Drive cockpit, an Xbox/DualSense gamepad, or a keyboard.
2. **Inclusive Diagnostic Workflow**:
   - Never assume every driver sits in a cockpit with load-cell pedals.
   - Use the **3-option peripheral selector** in Pep's chat (`🎮 Gamepad / Mando`, `🛞 Volante / Cockpit`, `⌨️ Teclado`) or explicit user mention to lock in the active peripheral.
   - Once the peripheral is known, **correlate the 50Hz telemetry trace anomalies with how that specific hardware translates human movement into simulator inputs**.

---

## 2. Telemetry-to-Peripheral Diagnostic Matrix (50Hz Signal Signatures)

### A. Brake Trace Diagnostics (`brake` channel at 50Hz)

| Telemetry Signature | Quantitative Threshold | Diagnosis by Peripheral | Hardware / In-Game Fix |
| :--- | :--- | :--- | :--- |
| **Vertical Release Cliff** (Abrupt dump of brake pressure at turn-in, unloading front axle -> entry understeer) | `brake` drops `0.85 -> 0.0` in `< 100 ms` (`< 5` samples); `trail_braking < 20%` | **Gamepad:** 7–9 mm trigger travel + high `Brake Gamma (> 1.5)` crushes the 10–25% trail zone into `< 1 mm` of finger movement.<br>**Potentiometer Pedal:** Position sensor lacks mechanical resistance at low travel.<br>**Load-Cell Pedal:** Non-linear `Brake Gamma (> 1.0)` distorting force curve, or muscle memory dumping pressure.<br>**Keyboard:** Digital key release (`20 ms`). | **Gamepad:** Set `Brake Gamma = 1.0 - 1.2` (linear) and decompress LT/L2 against spring tension.<br>**Potentiometer:** Set `Brake Gamma = 1.8 - 2.2` + stiffer elastomer.<br>**Load-Cell:** Strictly `Brake Gamma = 1.0` (100% linear).<br>**Keyboard:** Use 2–3 quick release taps (*tapping*) at turn-in + `+1/+2 ABS`. |
| **Lazy Initial Brake Attack** (Slow ramp to peak deceleration, extending braking distance) | `0.0 -> 0.90` takes `> 250 ms` (`> 12` samples) in a heavy braking zone | **Load-Cell Pedal:** Max force calibrated too high (driver straining to reach 100%) or `Brake Gamma > 1.5` delaying initial bite.<br>**Gamepad:** Excessive upper trigger deadzone or finger hesitation. | **Load-Cell:** Recalibrate max brake limit in software so ~80–85% comfortable leg effort hits 100% telemetry bar; keep `Brake Gamma = 1.0`. |
| **Parasitic Brake Drag on Straights** (Hidden straight-line time loss & front core overheating) | `brake` reads `0.01 - 0.04` while `throttle > 0.95` on straights | **Cockpit Pedals:** Driver resting left foot on load-cell/Hall pedal with `0%` deadzone.<br>**Gamepad:** Worn trigger return spring. | Add **`1% - 2%` Minimum Brake Deadzone** in game or wheelbase software. Recovers `0.2 - 0.5s` per lap on straights and lowers front tyre temps. |

---

### B. Steering & Lateral G Diagnostics (`steer_angle`, `lat_accel`, `excess_steer_deg`)

| Telemetry Signature | Quantitative Threshold | Diagnosis by Peripheral | Hardware / In-Game Fix |
| :--- | :--- | :--- | :--- |
| **Sawtooth / Stair-Step Mid-Corner Trace** (Jagged micro-corrections scrubbing front tyres) | `|d(steer_angle)/dt| > 250°/s` reversals mid-corner | **Gamepad:** `Steer Filter` too low (`< 70%`) or `Steer Gamma` too linear (`< 1.8`), turning thumb twitches into violent rack spikes.<br>**Cockpit Wheel:** FFB `Minimum Force > 0%` on a Direct Drive wheel or excessive `Road Effects`. | **Gamepad:** Raise `Steer Gamma = 2.2 - 2.5` and `Steer Filter = 90% - 98%`.<br>**Direct Drive Wheel:** Set `Minimum Force = 0%`, `Dynamic Damping = 100%`, `Road Effects <= 10%`. |
| **Apex Over-Rotation / Slip Saturation** (Wheel turned far past grip peak while Lateral G plateaus) | `excess_steer_deg > 12°` (`steer_to_g` spiked while `lat_accel` flatlines) | **Gamepad:** Thumbstick slammed to full lock faster than vertical load transfers to the nose.<br>**Cockpit Wheel:** **FFB Clipping** — `FFB Gain` is too high, saturating motor torque at 100% so the driver cannot feel the steering lighten when the front tyres let go. | **Gamepad:** Set `Speed Sensitivity = 60% - 70%` and `Steer Speed = 50% - 70%`.<br>**Cockpit Wheel:** Lower in-game `FFB Gain` (`70% - 85%`) until the FFB meter never clips red in high-load compression corners. |
| **Slow-Corner Lock Clamping** (Car refuses to rotate in tight hairpins despite full stick/key input) | Low `v_min` in hairpins with `|steer_angle|` plateauing well below lock | **Gamepad / Keyboard:** `Speed Sensitivity` set too high (`> 80%`) or `Steer Speed` too low (`< 35%`), artificially limiting virtual steering lock at low-to-medium speed. | Lower `Speed Sensitivity` to **`60% - 70%`** (Gamepad) or **`75% - 80%`** (Keyboard) and raise `Steer Speed` to **`50% - 65%`**. |

---

### C. Throttle Trace Diagnostics (`throttle` channel at 50Hz)

| Telemetry Signature | Quantitative Threshold | Diagnosis by Peripheral | Hardware / In-Game Fix |
| :--- | :--- | :--- | :--- |
| **Incomplete Full-Throttle Saturation** | `max(throttle) < 0.98` on full-power straights | Mechanical pedal stop, Hall magnet offset, or DualSense/Xbox trigger stop switch engaged. | Disengage physical trigger stop on racing games; set **`2% - 4%` Upper Throttle Deadzone** so full travel registers `1.00` (`100%`). |
| **Binary Exit Snap** (Immediate rear slip / TC intervention at apex exit) | `throttle` jumps `0.0 -> 1.0` in `< 80 ms` while `|steer_angle| > 35°` | **Gamepad:** Short RT/R2 trigger travel.<br>**Cockpit:** Overly aggressive throttle map or stiff pedal spring. | Set `Throttle Gamma = 1.1 - 1.2`, switch engine map to progressive throttle delivery, and link trigger squeeze to thumbstick/wheel unwinding. |

---

## 3. Canonical In-Game Baseline Profiles

### 🎮 1. Gamepad / Controller (Xbox, DualSense, PC Pad)
- **Brake Gamma**: `1.0 - 1.2` (near-linear so the 7–9 mm trigger travel gives predictable 15–20% trail-braking modulation).
- **Throttle Gamma**: `1.0 - 1.2`.
- **Steer Gamma**: `2.2 - 2.5` (desensitizes center stick for smooth initial turn-in without saturating front slip angle).
- **Speed Sensitivity**: `60% - 70%` (prevents high-speed twitchiness without choking slow-corner rotation).
- **Steer Filter**: `90% - 98%` (smooths thumb inputs into a progressive virtual steering rate).
- **Steer Speed**: `50% - 70%` (fast enough for chicanes without snapping the front axle).
- **Deadzone**: `1% - 3%` (just enough to prevent stick drift).
- **Steer Assist**: `Enabled` (helps catch snap oversteer slides faster than thumb travel allows).

### 🛞 2. Cockpit Steering Wheel & Pedals (Direct Drive / Belt + Load-Cell / Potentiometer)
- **Brake Gamma**:
  - **Load-Cell / Hydraulic Pedals**: Strictly `1.0` (100% linear force-to-pressure mapping).
  - **Potentiometer / Hall Entry Pedals**: `1.8 - 2.2` (expands resolution in the initial/trail-braking travel zone).
- **Pedal Deadzones**: `1% - 2%` minimum on Brake (if resting left foot on pedal); `0%` on Steering.
- **Steer Lock**: `900°` or Auto per car (`480° - 540°` real GT3 steering ratio matched 1:1 between wheelbase driver and game).
- **FFB Gain**: `70% - 85%` in-game (keep wheelbase software at 100% dynamic range; eliminate red FFB clipping in fast compressions so front understeer self-aligning torque drop is felt clearly).
- **Minimum Force**: `0%` on Direct Drive; `5% - 10%` on gear/belt wheels (Logitech G29/G923, Thrustmaster T300).
- **Dynamic Damping**: `100%` (natural gyroscopic tyre alignment during trail braking).
- **Road Effects**: `0% - 10%` (avoid masking front slip angle feel with canned kerb noise).

### ⌨️ 3. Keyboard (Digital Input)
- **Steer Assist & Stability Control**: `Enabled`.
- **Speed Sensitivity**: `75% - 85%`.
- **Steer Filter**: `95% - 100%`.
- **Steer Speed**: `35% - 50%`.
- **Modulation Technique & Garage Electronics**: Hold 100% brake in straight line, then execute **2–3 rapid release taps (*tapping*)** during turn-in to approximate trail braking, supported by **+1 to +2 clicks of ABS and TC** in the car setup.

---

## 4. Implementation Files in IdoRacing

- [gamepad_controller.md](file:///home/miquel/git/acc-coach/coach/knowledge/gamepad_controller.md)
- [knowledge_base.py](file:///home/miquel/git/acc-coach/coach/knowledge_base.py)
- [prompt.py](file:///home/miquel/git/acc-coach/coach/prompt.py)
- [radio.py](file:///home/miquel/git/acc-coach/coach/radio.py)
- [server.py](file:///home/miquel/git/acc-coach/api/server.py)
- [AIDebriefDrawer.tsx](file:///home/miquel/git/acc-coach/frontend/src/components/AIDebriefDrawer.tsx)
