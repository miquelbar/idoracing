# Periféricos de Conducción y Diagnóstico por Telemetría (Gamepad, Volante/Cockpit y Teclado)

> Valores de partida probados por la comunidad (ej. Opciones > Controles en ACC / simulador), no datos exportados por la telemetría. Pep debe presentarlos como punto de partida a probar de uno en uno, adaptar el vocabulario del ejercicio al periférico del piloto y correlacionar las trazas de 50Hz con la física del periférico.

## 0. Matriz de Diagnóstico de Telemetría 50Hz -> Periférico
- **Caída vertical de freno en entrada (`brake` cae de >0.80 a 0.0 en <100ms, sin rampa de trail braking)**:
  - *Gamepad*: Recorrido corto del gatillo (7-9 mm) o `Brake Gamma` demasiado alto (>1.5) que concentra toda la modulación al final. Solución: `Brake Gamma 1.0 - 1.2` y deslizar el dedo en vez de soltar el muelle.
  - *Pedalera Potenciómetro*: Falta de resistencia progresiva. Solución: subir `Brake Gamma` a `1.8 - 2.2` o añadir elastómero.
  - *Pedalera Load-Cell*: El piloto suelta por posición en vez de relajar presión muscular en kg. Verificar `Brake Gamma = 1.0` (100% lineal).
- **Freno parásito en recta (`brake` entre 0.01 y 0.04 con `throttle = 1.0`)**:
  - *Causa*: Pie izquierdo apoyado sobre célula de carga (Load-Cell) o deriva de muelle en gatillo/potenciómetro. Solución: añadir **`1% - 2%` de Brake Deadzone**.
- **Dientes de sierra o escalones en dirección (`steer_angle` con picos rápidos) + `excess_steer_deg > 10°` con G lateral plana**:
  - *Gamepad*: Pulgar llevando el stick al tope físico de golpe. Solución: subir `Steer Gamma` (`2.2 - 2.5`), `Steer Filter` (`92% - 98%`) y `Speed Sensitivity` (`60% - 70%`).
  - *Volante Cockpit*: **FFB Clipping** (barra FFB en rojo saturando el motor al 100%, impidiendo sentir cómo se aligera el volante al superar el *slip angle* óptimo de 6°-8°) o `Steer Lock` desajustado. Solución: bajar `FFB Gain` (`70% - 85%`) y subir `Dynamic Damping` (`100%`).
- **Falta de giro en horquillas / curvas lentas (<70 km/h) pese a pedir el máximo giro**:
  - *Gamepad / Teclado*: `Speed Sensitivity` excesivo (`>80%`) o `Steer Speed` demasiado lento (`<35%`) que recorta el ángulo virtual de las ruedas. Solución: bajar `Speed Sensitivity` a `60% - 70%`.
- **Gas incompleto en recta (`throttle` máximo 0.94 - 0.98) o latigazo binario en salida**:
  - *Incompleto*: Goma de tope o gatillo gastado -> añadir `2% - 3%` de *Throttle Upper Deadzone*.
  - *Latigazo en salida*: En Gamepad/Teclado usar `Throttle Gamma 1.2 - 1.5` y apoyarse en **+1/+2 clics de TC**.

## 1. Gamepad / Mando (Xbox, DualSense, PC Pad)
- **Brake Gamma (`1.0 - 1.2`)**: Mantenlo casi lineal. El recorrido del gatillo izquierdo (LT/L2) es muy corto; con gamma lineal cada milímetro de gatillo equivale a una presión de freno predecible, permitiendo soltar progresivamente en rampa (del 100% al 15-20%) en lugar de soltar de golpe. Si bloqueas al inicio, sube a `1.2`.
- **Throttle Gamma (`1.0 - 1.3`)**: Casi lineal para dosificar la apertura de gas en el gatillo derecho (RT/R2).
- **Steer Gamma (`2.2 - 2.5`)**: Hace menos sensible el centro del stick izquierdo, evitando meter exceso de ángulo de dirección de golpe en la entrada (causa directa de saturar el *slip angle* y subvirar).
- **Speed Sensitivity (`60% - 70%`)**: Reduce el ángulo máximo de giro al subir la velocidad. Si está por encima de `85%`, el coche se vuelve perezoso y no gira en horquillas o curvas lentas (subviraje inducido por filtro).
- **Steer Filter (`90% - 98%`) y Steer Speed (`50% - 70%`)**: El filtro suaviza los picos bruscos del pulgar; Steer Speed regula la rapidez de retorno al centro en chicanes.
- **Deadzone (`1% - 3%`)**: Solo lo mínimo para evitar deriva (*stick drift*).
- **Steer Assist (`Activado / Enabled`)**: Ayuda a recoger latigazos de sobreviraje que con stick son difíciles de contravolantear a tiempo.

## 2. Volante y Pedales (Cockpit)
- **Brake Gamma (`1.0` en Load-Cell / `1.8 - 2.2` en potenciómetro)**: Con pedalera de célula de carga (Load-Cell) usa siempre `1.0` (100% lineal: modulas por fuerza muscular en kg, no por recorrido). Si usas pedales de potenciómetro o Hall sin goma dura, sube a `1.8 - 2.2` para evitar bloquear al inicio.
- **Brake Deadzone (`0% - 1%`)**: Sin zona muerta salvo que apoyes el pie izquierdo en reposo (si hay roce de freno en recta, sube a `1% - 2%`).
- **Steer Lock / Grados de Giro (`900°` o Auto por coche, `480° - 540°` reales en Porsche 992 GT3 R)**: Deja que el simulador iguale el bloqueo real del GT3 para tener relación 1:1 en tus manos.
- **FFB Gain (`70% - 85%`)**: Ajustado para sentir la caída de peso en el volante cuando el neumático delantero supera el *slip angle* óptimo (subviraje), evitando que la barra de FFB entre en *clipping* rojo en apoyo fuerte.
- **Dynamic Damping (`100%`) y Road Effects (`0% - 10%`)**: Damping al 100% da el peso giroscópico real del neumático para sentir el trail braking; baja Road Effects para no enmascarar la pérdida de agarre delantero con vibraciones artificiales.

## 3. Teclado (Keyboard)
- **Steer Assist (`Activado / Enabled`) y Stability Control**: Imprescindibles al no tener entrada analógica continua.
- **Speed Sensitivity (`75% - 85%`) y Steer Filter (`95% - 100%`)**: Filtran el pulso binario de la tecla para que la rueda virtual gire en rampa progresiva y no sature el neumático delantero de golpe.
- **Steer Speed (`35% - 50%`)**: Evita latigazos al pulsar/soltar dirección.
- **Técnica de Trail Braking por Pulsos (*Tapping*) y ABS/TC**: Mantén pulsado freno al 100% en recta y, al iniciar el giro, haz **2-3 micro-pulsos rápidos (tapping)** en lugar de soltar en seco, apoyándote en **+1 o +2 clics de ABS y TC en el garaje**.
