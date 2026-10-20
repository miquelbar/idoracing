# Dinámica de Neumáticos en Competición y Simracing
*(Basado en Paul Haney "The Racing & High-Performance Tire", Aris Vasilakos - Físicas Kunos/ACC)*

El neumático es el **único punto de contacto** entre el coche y la pista (cuatro parches de contacto de poco más del tamaño de una mano). Todo el comportamiento del vehículo se rige por cómo trabaja este parche.

---

## 1. El Círculo de Adherencia y el Slip Angle (Ángulo de Deriva)

### El Círculo de Tracción (Kamm Circle)
Un neumático tiene una cantidad finita de fricción disponible ($\mu \cdot F_z$). Esta fricción debe repartirse vectorialmente entre:
- **Fuerza Longitudinal**: Frenada o Aceleración.
- **Fuerza Lateral**: Giro y apoyo en curva.

$$\sqrt{F_{\text{longitudinal}}^2 + F_{\text{lateral}}^2} \le F_{\text{máxima}}$$

**Regla de Oro de Telemetría**:
Si el piloto aplica el 100% del pedal de freno, la capacidad lateral es **cero** (el coche irá recto si gira el volante). Para que el coche empiece a inscribirse en la curva, el piloto DEBE soltar gradualmente el freno (técnica de **Trail Braking**): a medida que el freno baja del 100% al 40%, 20%, 0%, la adherencia lateral disponible sube del 0% al 60%, 80%, 100%.

### Ángulo de Deriva (Slip Angle)
El neumático no gira en la dirección geométrica exacta a la que apuntan las ruedas. Existe una deformación elástica de la carcasa llamada ángulo de deriva ($\alpha$):
- A medida que aumenta el ángulo de deriva (girar volante), el agarre lateral sube hasta un **pico óptimo (Peak Slip Angle)**, típicamente entre **4° y 8°** en un GT3.
- Si el piloto gira más el volante y supera ese pico, entra en la zona de **deslizamiento macroscópico (Saturación)**: el agarre decae en picado, el neumático se sobrecalienta superficialmente y el coche entra en subviraje severo.
- **Lección para el piloto**: Girar más el volante cuando el morro no entra NUNCA ayuda; hay que reducir volante para devolver el neumático a su slip angle óptimo.

---

## 2. Ventana Óptima en Assetto Corsa Competizione (ACC GT3 DHE)

En ACC, el compuesto **Pirelli DHE** (GT3 2020+) utiliza un modelo termodinámico de 5 capas:

### Presiones en Caliente (Hot Pressures)
- **Rango Óptimo Estricto**: **26.5 a 27.0 psi** (medido tras 3-4 vueltas consecutivas en ritmo).
- **El Punto Dulce Ideal**: **26.7 - 26.9 psi**.
- **Consecuencia de rodar por debajo (< 26.5 psi)**:
  - Carcasa excesivamente flexible y flácida.
  - Respuesta de dirección vaga y lenta.
  - Sobrecalentamiento excesivo en los hombros del neumático.
- **Consecuencia de rodar por encima (> 27.0 psi)**:
  - La banda de rodadura se abomba hacia el centro.
  - Se reduce el área de contacto real.
  - Caída abrupta de agarre lateral (-10% a -15%).
  - El coche se vuelve nervioso y rebota sobre los pianos.

### Estimación de Presiones en Frío (Cold Pressures)
Por cada aumento de 10°C en la temperatura de pista o ambiente, la presión en caliente sube aproximadamente 0.7 - 1.0 psi:
- **Pista Estándar (25°C - 30°C)**: Salir con presiones en frío alrededor de **24.2 - 24.6 psi**.
- **Pista Fría (< 20°C)**: Subir presiones en frío a **25.0 - 25.5 psi** para alcanzar la ventana en caliente.
- **Pista Calurosa (> 35°C)**: Bajar presiones en frío a **23.5 - 24.0 psi**.

---

## 3. Diagnóstico de Temperaturas I / M / O (Interior / Medio / Exterior)

La distribución térmica a lo largo de la banda de rodadura revela exactamente cómo apoya el coche:

### La Regla del Gradiente
En un coche de carreras con caída negativa (Camber), el interior siempre trabaja más en recta y el exterior apoya en curva:
- **Gradiente Saludable**: La temperatura interior (I) debe ser entre **5°C y 12°C más caliente** que la exterior (O):
  $$T_{\text{Inner}} > T_{\text{Middle}} > T_{\text{Outer}}$$
  Ejemplo óptimo: `I: 84°C | M: 81°C | O: 77°C`.

### Diagnóstico de Fallos:
1. **Centro más caliente que los hombros ($T_M > T_I$ y $T_M > T_O$)**:
   - **Causa**: Sobrepresión. Bajar la presión de inflado (-0.3 a -0.5 psi).
2. **Centro más frío que ambos hombros ($T_M < T_I$ y $T_M < T_O$)**:
   - **Causa**: Subpresión. Subir la presión de inflado (+0.3 a +0.5 psi).
3. **Exterior igual o más caliente que el interior ($T_O \ge T_I$)**:
   - **Causa**: Falta de caída negativa (Insufficient Negative Camber) o exceso de subviraje sobreconduciendo el tren delantero. Dar más caída negativa (-0.2° a -0.4°).
4. **Interior excesivamente más caliente ($T_I - T_O > 15°C$)**:
   - **Causa**: Exceso de caída negativa o divergencia excesiva (Toe-out). Reducir caída o corregir convergencia.
