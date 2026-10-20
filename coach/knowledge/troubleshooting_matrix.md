# Matriz de Diagnóstico de Comportamiento: Pilotaje vs Setup
*(Basada en Carroll Smith, Jorge Segers y telemetría de simracing)*

Esta matriz separa de forma tajante si un problema se debe a la técnica del piloto (90% de los casos en telemetría) o si requiere ajuste mecánico del vehículo (cuando la técnica es consistente y el coche tiene una limitación de equilibrio).

---

## 1. Fase de Frenada Recta (Straight-Line Braking)
*Desde el punto de frenada inicial (Braking Point) hasta el inicio del giro (Turn-in).*

### Síntoma A: Bloqueo delantero precoz (ABS actuando al máximo, vibración en volante)
- **Diagnóstico de Pilotaje**: 
  - La patada inicial de freno no es suficientemente rápida o progresiva.
  - El piloto frena con ruedas no alineadas o sobre baches sin modular.
- **Ajuste de Setup**:
  - Si la técnica es correcta: Retrasar el Reparto de Frenada (**Brake Bias -0.5% a -1.0%** hacia atrás).
  - Bajar 1 punto el ABS si el coche está excesivamente retenido sin parar el vehículo.
  - Ablandar los amortiguadores delanteros en compresión rápida (Fast Bump) si el bloqueo ocurre al pillar ondulaciones.

### Síntoma B: La zaga se vuelve inestable o "baila" en frenada recta
- **Diagnóstico de Pilotaje**:
  - Correcciones bruscas de volante mientras el pedal de freno está al 100%.
  - Reducciones de marcha demasiado rápidas (sobre-revoluciones que bloquean el eje trasero por freno motor).
- **Ajuste de Setup**:
  - Adelantar el Reparto de Frenada (**Brake Bias +0.5% a +1.0%** hacia adelante).
  - Aumentar la precarga del diferencial (**Differential Preload +10 a +20 Nm**), lo que bloquea más el eje trasero en retención manteniendo el coche recto.
  - Subir alerón trasero o endurecer la amortiguación trasera en extensión (Rebound) para evitar que la zaga se levante de golpe.

---

## 2. Fase de Entrada y Giro en Apoyo (Trail Braking & Turn-In)
*Desde que se empieza a meter volante mientras se modula la descompresión del freno hasta el vértice.*

### Síntoma A: Subviraje en entrada (El morro no entra, empuja hacia fuera)
- **Diagnóstico de Pilotaje**:
  - **Exceso de presión de freno**: Si el piloto mantiene >30% de freno con más de 45° de volante, el neumático delantero supera el círculo de adherencia (slip angle saturado).
  - **Soltada de freno demasiado brusca**: La masa del coche se desplaza hacia atrás antes de llegar al vértice, descargando los neumáticos delanteros.
- **Ajuste de Setup (si el trail braking es suave pero el morro no gira)**:
  - Retrasar el Reparto de Frenada (**Brake Bias -0.5% a -1.0%**).
  - Ablandar la barra estabilizadora delantera (**Front ARB -1 punto**).
  - Reducir la precarga del diferencial (**Preload -10 a -20 Nm**) para permitir mayor diferencia de giro entre ruedas traseras al inscribir el coche.
  - Reducir compresión lenta delantera (Slow Bump) o extensión lenta trasera (Slow Rebound) para mantener peso en el morro más tiempo.

### Síntoma B: Sobreviraje en entrada / Latigazo de atrás (Snap Oversteer)
- **Diagnóstico de Pilotaje**:
  - El piloto gira el volante de forma violenta mientras suelta el freno de golpe, desestabilizando la plataforma aerodinámica.
- **Ajuste de Setup**:
  - Aumentar la precarga del diferencial (**Preload +10 a +30 Nm**).
  - Endurecer barra estabilizadora delantera (**Front ARB +1**) o ablandar la trasera (**Rear ARB -1**).
  - Aumentar la convergencia trasera positiva (**Rear Toe +0.05° a +0.10°** hacia adentro) para dar estabilidad lateral al tren trasero.

---

## 3. Fase de Vértice / Mitad de Curva (Mid-Corner / Apex)
*Punto de velocidad mínima ($V_{min}$), dirección en ángulo máximo, pedales neutros o paso de transición freno-gas.*

### Síntoma A: El coche no rota en vértice (Subviraje constante)
- **Diagnóstico de Pilotaje**:
  - **Exceso de velocidad de entrada**: El piloto llegó demasiado rápido y supera la adherencia máxima lateral del tren delantero.
  - Ángulo de volante excesivo: girar más el volante cuando el neumático ya desliza solo agrava el subviraje y destruye el neumático.
- **Ajuste de Setup**:
  - **Aumentar el Rake aerodinámico**: Bajar la altura delantera 1-2 mm o subir la altura trasera 2-4 mm. Esto desplaza el centro de presiones aerodinámico hacia el eje delantero.
  - Ablandar barra estabilizadora delantera (**Front ARB -1**) o endurecer la trasera (**Rear ARB +1**).
  - Aumentar caída negativa delantera (**Front Camber -0.2° a -0.4°**) si la temperatura exterior del neumático delantero está más fría que la interior.

### Síntoma B: La zaga se descoloca en vértice sin tocar gas
- **Diagnóstico de Pilotaje**:
  - Corrección repentina de volante o corte brusco de inercia.
- **Ajuste de Setup**:
  - Reducir el Rake aerodinámico (bajar trasera o subir delantera).
  - Endurecer barra estabilizadora delantera (**Front ARB +1**) o ablandar la trasera (**Rear ARB -1**).

---

## 4. Fase de Tracción Inicial (Throttle Pickup)
*Desde el vértice cuando el piloto comienza a aplicar el acelerador hasta ~50% de gas.*

### Síntoma A: Pérdida instantánea de tracción / Derrape de atrás (Power Oversteer)
- **Diagnóstico de Pilotaje**:
  - Aplicar gas antes de abrir dirección. Hay que empezar a acelerar cuando el volante empieza a desenroscarse.
  - Patada al gas en vez de aplicación progresiva (squeeze the throttle).
- **Ajuste de Setup**:
  - Subir 1 punto el Control de Tracción (**TC1 +1**).
  - Ablandar barra estabilizadora trasera (**Rear ARB -1**).
  - Ablandar compresión lenta trasera (Rear Slow Bump) para que la masa transfiera suavemente a las ruedas motrices.
  - Aumentar la precarga del diferencial si una sola rueda interior patina descontrolada.

### Síntoma B: Subviraje en aceleración (Push understeer)
- **Diagnóstico de Pilotaje**:
  - Acelerar a fondo demasiado pronto con mucho ángulo de volante residual. La masa se va atrás y el morro flota.
- **Ajuste de Setup**:
  - Reducir la precarga del diferencial (**Preload -10 a -20 Nm**).
  - Ablandar barra estabilizadora delantera (**Front ARB -1**).
  - Endurecer amortiguación trasera en compresión lenta (Rear Slow Bump) para limitar la transferencia excesiva de masa hacia atrás.

---

## 5. Fase de Salida de Curva (Corner Exit / Full Throttle)
*Desde el desenrosque de volante hasta la recta a fondo.*

### Síntoma A: Falta de estabilidad a alta velocidad en apoyos rápidos
- **Ajuste de Setup**:
  - Subir alerón trasero (**Rear Wing +1**).
  - Verificar presiones de neumáticos: si la presión supera los **27.0 psi en ACC**, la huella de contacto se abomba y el coche pierde agarre lateral a alta velocidad.
