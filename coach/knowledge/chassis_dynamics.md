# Dinámica de Chasis y Ajustes de Setup
*(Basado en Carroll Smith "Tune to Win", Jorge Segers "Data Acquisition for Racecars")*

El comportamiento de un coche de carreras en pista se rige por la **transferencia de masas** (longitudinal y lateral) y cómo el chasis distribuye esa carga entre los cuatro neumáticos.

---

## 1. Transferencia de Masas (Weight Transfer)

### Transferencia Longitudinal (Frenada y Aceleración)
$$\Delta W_{\text{longitudinal}} = \frac{m \cdot a_x \cdot h}{L}$$
Donde $m$ es la masa, $a_x$ la aceleración/deceleración, $h$ la altura del centro de gravedad y $L$ la batalla (distancia entre ejes).
- **Al frenar**: La masa se transfiere hacia el tren delantero, aumentando la adherencia disponible de los neumáticos delanteros y descargando los traseros.
- **Al acelerar**: La masa se transfiere hacia el tren trasero, dando tracción pero descargando el tren delantero (tendencia al subviraje de potencia).

### Transferencia Lateral (Paso por Curva)
$$\Delta W_{\text{lateral}} = \frac{m \cdot a_y \cdot h}{t}$$
Donde $a_y$ es la aceleración lateral y $t$ el ancho de vías.
- La rueda exterior soporta la mayor parte de la carga lateral, mientras la interior se descarga.
- **Ley de Carroll Smith**: El eje que tiene **mayor rigidez al balanceo (Roll Stiffness)** transfiere más carga entre sus ruedas y, por tanto, **pierde agarre lateral relativo antes**:
  - Si endureces la parte delantera (muelles o ARB delantera), aumentas el **subviraje**.
  - Si endureces la parte trasera (muelles o ARB trasera), aumentas el **sobreviraje**.

---

## 2. Parámetros de Reglaje y su Impacto

### 1. Reparto de Frenada (Brake Bias - BB)
- **Rango habitual en GT3**: **52.0% a 57.0%** hacia el eje delantero.
- **Efecto de adelantar (ej. 55.5% -> 56.5%)**:
  - Mayor estabilidad en frenada recta.
  - Mayor tendencia al subviraje en la fase de trail braking (bloqueo prematuro de ruedas delanteras).
- **Efecto de retrasar (ej. 55.0% -> 54.0%)**:
  - Ayuda enormemente a inscribir y rotar el coche en la entrada de la curva (trail braking efectivo).
  - Riesgo: Si se retrasa demasiado, la zaga se descoloca en frenadas en apoyo o se bloquean las ruedas traseras.

### 2. Barras Estabilizadoras (Anti-Roll Bars - ARB)
Las ARB controlan el balanceo lateral del chasis sin afectar la rigidez en baches longitudinales:
- **ARB Delantera (Front ARB)**:
  - **Más blanda (-)**: Mayor agarre del tren delantero en curvas lentas y medias, reduce el subviraje en curva.
  - **Más dura (+)**: Dirección más reactiva y directa en cambios rápidos de apoyo (chicanes), pero aumenta el subviraje.
- **ARB Trasera (Rear ARB)**:
  - **Más blanda (-)**: Mayor tracción a la salida de curva, zaga más asentada y predecible.
  - **Más dura (+)**: Ayuda a rotar el coche en mitad de curva ($V_{min}$), pero hace la zaga más nerviosa en aceleración.

### 3. Aerodinámica y Rake (Alturas de Marcha)
- **Rake Aerodinámico**: Diferencia de altura entre el eje trasero y el delantero ($H_{\text{trasera}} - H_{\text{delantera}}$).
  - En GT3 (y especialmente en ACC), aumentar el rake (ej. subir 3mm la trasera o bajar 2mm la delantera) aumenta el ángulo del difusor trasero y desplaza el **Centro de Presión Aerodinámico (CoP)** hacia adelante.
  - **Resultado**: Mayor rotación y velocidad de paso en curvas medias y rápidas (>120 km/h).
  - **Límite**: Si el rake es excesivo, el flujo bajo el fondo plano se despega (stall del difusor) y se pierde toda la carga trasera de golpe.
- **Alerón Trasero (Rear Wing)**:
  - Subir alerón: Estabilidad crucial en frenadas a alta velocidad y tracción en curvas rápidas (ej. Curva 14 Valencia, Blanchimont Spa). Aumenta la resistencia al avance (drag) en recta.

### 4. Precarga del Diferencial (Differential Preload - Nm)
El diferencial autoblocante mecánico regula cuánto se bloquean las dos ruedas motrices traseras:
- **Valores típicos**: **50 Nm a 140 Nm**.
- **En Desaceleración / Entrada a Curva (Off-Throttle)**:
  - **Mayor Precarga (+Nm)**: Bloquea el eje trasero, manteniendo el coche muy estable en frenada recta, pero dificulta la rotación inicial en curva lenta (provoca subviraje de entrada).
  - **Menor Precarga (-Nm)**: Permite que la rueda exterior e interior giren a velocidades distintas con libertad, facilitando enormemente la entrada a curva, pero hace la zaga más viva.
- **En Aceleración / Salida a Curva (On-Throttle)**:
  - **Mayor Precarga (+Nm)**: Evita que patine la rueda interior en bordillos y entrega tracción simétrica, aunque si derrapa, el latigazo es más repentino.

### 5. Geometría de Suspensión: Caída (Camber) y Convergencia (Toe)
- **Caída Negativa (Camber)**:
  - Permite que el neumático apoye completamente plano cuando el coche balancea en curva.
  - GT3 en ACC suele buscar caídas agresivas (delantera: -3.4° a -4.0°, trasera: -2.8° a -3.2°).
- **Convergencia (Toe)**:
  - **Delantera**: Ligeramente negativa (Divergencia / Toe-out, ej. -0.05° a -0.15°) para agudizar la respuesta inicial de giro.
  - **Trasera**: Siempre positiva (Convergencia / Toe-in, ej. +0.10° a +0.25°) para mantener las ruedas traseras estables bajo aceleración longitudinal.
