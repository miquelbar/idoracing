---
name: simracing-engineer
description: >-
  Expert Race Engineering & Vehicle Dynamics guide for simracing (ACC, iRacing, LMU).
  Provides canonical principles, setup diagnostics, tyre physics (26.5-27.0 psi in ACC),
  corner phase separation (braking, trail braking, apex, exit), and car architecture nuances.
---

# Simracing Race Engineer Skill (IdoRacing)

This skill equips AI agents and Pep (the Race Engineer) with real-world motorsport dynamics and simulator-specific physics (Assetto Corsa Competizione, iRacing, Le Mans Ultimate).

---

## 1. Core Engineering Literature Grounding

The engineering logic in this system is rooted in the canonical literature:

1. **Carroll Smith (*Tune to Win* / *Drive to Win*)**:
   - Lateral & longitudinal weight transfer.
   - Roll stiffness distribution: Stiffening one end increases that end's load transfer and *reduces* its relative lateral grip.
   - Golden rule: Never tune out a driver technique deficiency with mechanical setup.

2. **Paul Haney (*The Racing & High-Performance Tire*)**:
   - Friction circle (Kamm circle): $\sqrt{F_x^2 + F_y^2} \le \mu F_z$.
   - Slip angle dynamics: Maximum grip occurs at 4° to 8° slip angle. Turning the steering wheel beyond saturation decreases cornering force and overheats the tread surface.

3. **Jorge Segers (*Analysis Techniques for Racecar Data Acquisition*)**:
   - Telemetry channel analysis: Speed delta, brake shape, throttle pickup distance, and lateral acceleration vs steer angle.

4. **Aris Vasilakos (Head of Physics, Kunos / ACC)**:
   - DHE 5-point thermodynamic tyre model.
   - Optimal hot tyre pressure window: strictly **26.5 - 27.0 psi** (sweet spot **26.7 - 26.9 psi**).
   - Aerodynamic rake impact on diffuser expansion and Center of Pressure (CoP).

---

## 2. Corner Phase Diagnostic Protocol

Always analyze driving problems by isolating the specific corner phase:

| Corner Phase | Focus | Driver Technique Check | Mechanical Setup Solution |
| :--- | :--- | :--- | :--- |
| **1. Straight Braking** | Deceleration | Initial brake hit velocity, downshift timing | If locking up: Brake Bias -0.5% to -1.0% rearward. If rear snaps: Brake Bias +0.5% forward, Differential Preload +10-20 Nm. |
| **2. Trail Braking & Turn-In** | Weight transition | Smoothness of brake release as steer angle increases | If understeer: Brake Bias rearward, Front ARB softer (-1), lower differential preload (-10 Nm). |
| **3. Apex ($V_{min}$)** | Direction change | Entry speed overshooting, excess steering angle | If persistent understeer: Increase Rake (+2-3mm rear or -1-2mm front), Front ARB softer (-1). |
| **4. Throttle Pickup** | Initial power | Throttle squeeze timing vs steering unwinding | If snap oversteer: TC1 +1 click, Rear ARB softer (-1), softer rear slow bump. |
| **5. Exit Acceleration** | Traction to straight | Full throttle commitment and track-out curb usage | If power understeer: Lower diff preload (-10 Nm), softer front ARB. |

---

## 3. Simulator & Compound Specifics

### Assetto Corsa Competizione (ACC)
- **Compound**: Pirelli DHE Slick (Dry).
- **Pressures in Hot**: Must read **26.5 to 27.0 psi** after 3-4 consecutive laps.
- **Temperatures I/M/O**: Inner should be 5°C to 12°C warmer than Outer ($T_{\text{inner}} > T_{\text{middle}} > T_{\text{outer}}$).
  - Center hot ($T_m > T_i, T_o$): Over-inflated (lower pressure).
  - Center cool ($T_m < T_i, T_o$): Under-inflated (raise pressure).
  - Outer hot ($T_o \ge T_i$): Insufficient negative camber or severe over-driving.

---

## 4. Car Architectures (GT3 Layouts)

- **Rear Engine (RR - Porsche 992 GT3 R)**:
  - 38/62 mass distribution.
  - Colossal straight-line braking and initial traction.
  - Prone to entry understeer if trail braking is neglected (front axle is light).
  - Risk of lift-off oversteer if throttle is dumped abruptly mid-corner.
- **Front-Mid Engine (FR - BMW M4 GT3, Aston Martin AMR)**:
  - 50/50 mass distribution, long wheelbase.
  - Very compliant over kerbs, highly forgiving.
  - Prone to front tyre degradation if overdriven.
- **Mid-Engine (MR - Ferrari 296, Audi R8, McLaren 720S)**:
  - Low polar moment of inertia, rapid initial rotation.
  - Sensitive rear end under heavy trail braking in high-speed entries.

---

## 5. Implementation Files in IdoRacing

- [troubleshooting_matrix.md](file:///home/miquel/git/acc-coach/coach/knowledge/troubleshooting_matrix.md)
- [tire_dynamics.md](file:///home/miquel/git/acc-coach/coach/knowledge/tire_dynamics.md)
- [chassis_dynamics.md](file:///home/miquel/git/acc-coach/coach/knowledge/chassis_dynamics.md)
- [car_architectures.md](file:///home/miquel/git/acc-coach/coach/knowledge/car_architectures.md)
- [knowledge_base.py](file:///home/miquel/git/acc-coach/coach/knowledge_base.py)
