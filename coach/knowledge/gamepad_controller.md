# Pilotaje con mando (gamepad) en ACC

> Valores de partida de la comunidad, no datos medidos por la telemetría. Pep debe presentarlos como punto de partida a probar y ajustar, nunca como verdad absoluta. Los nombres de las opciones son los del menú Opciones > Controles > Mando de ACC; en otros simuladores los nombres y rangos cambian.

## 1. Ajustes del juego que más afectan al trail braking y al subviraje
- **Brake Gamma (1.0 - 1.2)**: mantenlo casi lineal. El recorrido del gatillo es corto; con gamma lineal cada milímetro de gatillo equivale a una presión de freno predecible, lo que permite soltar el freno de forma progresiva en lugar de binaria. Si bloqueas al pisar, sube a ~1.2 para ganar resolución al inicio del recorrido.
- **Throttle Gamma (1.0 - 1.2)**: igual criterio; evita picos de gas en la salida que provocan sobreviraje.
- **Steer Gamma (2.2 - 2.5 como punto de partida)**: hace menos sensible el centro del stick. Menos micro-correcciones bruscas y menos "ángulo de golpe" al entrar, que es una causa típica de subviraje por exceso de volante.
- **Speed Sensitivity (60 - 70 %)**: reduce el ángulo máximo de volante al aumentar la velocidad. Demasiado bajo = giros violentos a alta velocidad; demasiado alto = el coche no gira en curvas lentas (subviraje aparente).
- **Steer Filter y Steer Speed**: suavizan y limitan la velocidad de giro virtual del volante. Un filtro alto (90 %+) estabiliza; si el coche tarda en reaccionar al cambiar de dirección, sube Steer Speed (50 - 70 %).
- **Deadzone (1 - 3 %)**: solo lo necesario para eliminar la deriva del stick.
- **Steer Assist**: puede activarse para ayudar a recoger sobreviraje que el mando no permite corregir con la rapidez de un volante.

## 2. Cómo conectarlo con el diagnóstico de telemetría
- Si el ángulo de volante llega a su máximo ANTES de que el coche rote y la velocidad mínima de curva cae: probable exceso de entrada de volante. Primero suaviza Steer Gamma / Speed Sensitivity y mide de nuevo; después trabaja la técnica.
- Si el freno se suelta de golpe (< 25 % de trail braking): con mando es habitual por la falta de recorrido; ajusta Brake Gamma y practica soltar el gatillo en rampa, no de golpe.
- Un cambio de ajustes del mando debe probarse de uno en uno, 3 - 5 vueltas por cambio, comparando la velocidad de vértice y el ángulo de volante máximo.

## 3. Reglas para Pep
- Nunca inventes que el piloto tiene estos valores: la telemetría no los exporta. Pregunta qué valores tiene o propón los de partida.
- Combina SIEMPRE el consejo de técnica (trail braking progresivo) con el de ajustes del mando cuando el piloto mencione mando, gamepad o stick.
