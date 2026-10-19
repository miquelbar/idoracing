import type { ComparisonResponse, CornerDTO } from '../types/telemetry';

// Same threshold as the backend: smaller line offsets are within position noise.
export const LINE_OFFSET_NOTE_M = 0.5;

export function formatGear(gear: number, lang: string): string {
  if (lang === 'en') {
    if (gear === 1) return '1st';
    if (gear === 2) return '2nd';
    if (gear === 3) return '3rd';
    return `${gear}th`;
  }
  return `${gear}ª`;
}

/** Entry, apex and exit numbers for one corner, read from the aligned traces of both laps. */
export function computePhaseMetrics(selectedCorner: CornerDTO, comparison: ComparisonResponse) {
  const dists = comparison.distance || [];
  const refSpeeds = comparison.ref_speed || [];
  const compSpeeds = comparison.comp_speed || [];
  const refBrakes = comparison.ref_brake || [];
  const compBrakes = comparison.comp_brake || [];
  const refThrottles = comparison.ref_throttle || [];
  const compThrottles = comparison.comp_throttle || [];

  const findIdx = (targetDist: number) => {
    if (dists.length === 0) return 0;
    let closest = 0;
    let minD = Math.abs(dists[0] - targetDist);
    for (let i = 1; i < dists.length; i++) {
      const d = Math.abs(dists[i] - targetDist);
      if (d < minD) {
        minD = d;
        closest = i;
      }
    }
    return closest;
  };

  const entryIdx = findIdx(selectedCorner.start_distance);
  const exitIdx = findIdx(selectedCorner.end_distance);
  const apexIdx = findIdx(selectedCorner.apex_distance);

  // 1. Punto de frenada (Braking point)
  let refBrakeIdx = -1;
  let compBrakeIdx = -1;
  const searchStart = Math.max(0, entryIdx - 40);
  for (let i = searchStart; i <= apexIdx; i++) {
    if (refBrakeIdx === -1 && (refBrakes[i] || 0) > 0.15) {
      refBrakeIdx = i;
    }
    if (compBrakeIdx === -1 && (compBrakes[i] || 0) > 0.15) {
      compBrakeIdx = i;
    }
    if (refBrakeIdx !== -1 && compBrakeIdx !== -1) break;
  }

  const isFlatOut = refBrakeIdx === -1 && compBrakeIdx === -1;
  const refBrakeDist = refBrakeIdx !== -1 ? Math.round(dists[refBrakeIdx]) : Math.round(selectedCorner.start_distance);
  const compBrakeDist = compBrakeIdx !== -1 ? Math.round(dists[compBrakeIdx]) : Math.round(selectedCorner.start_distance);
  const brakeDelta = compBrakeDist - refBrakeDist;

  // 2. Suelta de freno / Trail braking
  const trailWindowStart = Math.max(0, apexIdx - 12);
  let refTrailSum = 0;
  let compTrailSum = 0;
  let trailCount = 0;
  for (let i = trailWindowStart; i <= apexIdx; i++) {
    refTrailSum += refBrakes[i] || 0;
    compTrailSum += compBrakes[i] || 0;
    trailCount++;
  }
  const refTrailPct = Math.round((refTrailSum / trailCount) * 100);
  const compTrailPct = Math.round((compTrailSum / trailCount) * 100);
  const trailCode = selectedCorner.trail_braking_code;

  // 3. Línea y Ápice (Track position)
  const isUndersteer = selectedCorner.racing_line_svg?.has_understeer || selectedCorner.balance_code === 'understeer';
  const isEarly = selectedCorner.racing_line_code === 'early_apex';
  const isLineOptimal = selectedCorner.racing_line_code === 'optimal';

  // 4. Velocidad mínima (Apex Vmin) & Marcha fusionada
  const minRef = Math.round(selectedCorner.v_min_ref);
  const minComp = Math.round(selectedCorner.v_min_comp);
  const minDelta = Number((minComp - minRef).toFixed(1));
  const refGear = selectedCorner.ref_gear ?? (comparison.ref_gear?.[apexIdx] || 3);
  const compGear = selectedCorner.comp_gear ?? (comparison.comp_gear?.[apexIdx] || 3);
  const gearDiff = compGear - refGear;

  // 5. Aplicación de gas (Throttle onset)
  let refThIdx = -1;
  let compThIdx = -1;
  for (let i = apexIdx; i < Math.min(dists.length, exitIdx + 20); i++) {
    if (refThIdx === -1 && (refThrottles[i] || 0) > 0.10) refThIdx = i;
    if (compThIdx === -1 && (compThrottles[i] || 0) > 0.10) compThIdx = i;
    if (refThIdx !== -1 && compThIdx !== -1) break;
  }

  const apexDist = dists[apexIdx] || selectedCorner.apex_distance;
  const refThDist = refThIdx !== -1 ? Math.max(0, Math.round(dists[refThIdx] - apexDist)) : null;
  const compThDist = compThIdx !== -1 ? Math.max(0, Math.round(dists[compThIdx] - apexDist)) : null;
  // The delta must agree with the two cells it is printed next to.
  const thDelta = refThDist !== null && compThDist !== null ? compThDist - refThDist : null;

  // 6. Velocidad de salida (Exit speed)
  const exitRef = Math.round(selectedCorner.v_exit_ref ?? refSpeeds[exitIdx]);
  const exitComp = Math.round(selectedCorner.v_exit_comp ?? compSpeeds[exitIdx]);
  const exitDelta = Number((exitComp - exitRef).toFixed(1));

  return {
    braking: {
      isFlatOut,
      refDist: refBrakeDist,
      compDist: compBrakeDist,
      delta: brakeDelta,
    },
    trail: {
      refPct: refTrailPct,
      compPct: compTrailPct,
      code: trailCode,
    },
    position: {
      isUndersteer,
      isEarly,
      isLineOptimal,
      offsets:
        selectedCorner.line_offset_apex_m != null
          ? {
              entry: selectedCorner.line_offset_entry_m ?? 0,
              apex: selectedCorner.line_offset_apex_m,
              exit: selectedCorner.line_offset_exit_m ?? 0,
            }
          : null,
    },
    min: {
      ref: minRef,
      comp: minComp,
      delta: minDelta,
      refGear,
      compGear,
      gearDiff,
    },
    throttle: {
      refDist: refThDist,
      compDist: compThDist,
      delta: thDelta,
    },
    exit: {
      ref: exitRef,
      comp: exitComp,
      delta: exitDelta,
    },
  };
}

export type PhaseMetrics = ReturnType<typeof computePhaseMetrics>;

/** The three-step improvement plan shown under the phase table. */
export function buildActionPlan(phaseMetrics: PhaseMetrics, lang: string): { entry: string; apex: string; exit: string } {
  const isEn = lang === 'en';
  const { braking, trail, position, min, throttle, exit } = phaseMetrics;

  // 1. Entrada y Frenada
  let entryText = '';
  if (isEn) {
    if (braking.isFlatOut) {
      entryText = 'Fast corner: carry speed with maximum lateral stability and smooth steering wheel turn-in.';
    } else if (braking.delta < -8) {
      entryText = `Braking ${Math.abs(Math.round(braking.delta))}m too early. Delay initial brake hit towards the 100m marker and stretch progressive release into the apex.`;
    } else if (braking.delta > 8) {
      entryText = `Braking ${Math.round(braking.delta)}m late and arriving overloaded. Move braking point back to stabilize front tyres before turn-in.`;
    } else if (position.isUndersteer) {
      entryText = 'The car pushes wide on turn-in. Open up against the outer kerb and keep some brake pressure into the apex to help the nose rotate.';
    } else if (trail.code === 'early_release' || trail.compPct < 8) {
      entryText = 'Releasing the brake abruptly before turn-in. Smoothly bleed off brake pressure (trail braking) to keep front axle loaded.';
    } else {
      entryText = 'Well-synchronized braking approach. Keep eyes pinned on the apex and maintain smooth progressive pedal transition.';
    }
  } else {
    if (braking.isFlatOut) {
      entryText = 'Curva de alta velocidad: mantén el paso sin levantar bruscamente y guía el morro con volante progresivo.';
    } else if (braking.delta < -8) {
      entryText = `Frenas ${Math.abs(Math.round(braking.delta))}m antes de la referencia. Retrasa el punto de frenada aprovechando las marcas de 100m y alarga la suelta progresiva.`;
    } else if (braking.delta > 8) {
      entryText = `Frenas ${Math.round(braking.delta)}m más tarde y entras pasado. Anticipa la presión de freno para no saturar el tren delantero al girar.`;
    } else if (position.isUndersteer) {
      entryText = 'El morro se abre al girar. Ábrete pegado al piano exterior y mantén algo de freno hasta el vértice (trail braking) para rotar el morro.';
    } else if (trail.code === 'early_release' || trail.compPct < 8) {
      entryText = 'Sueltas el freno bruscamente antes de girar. Modula el pedal en regresión (trail braking) para no aligerar el eje delantero en la entrada.';
    } else {
      entryText = 'Frenada y aproximación sincronizadas. Mantén la vista en el vértice y una modulación estable del pedal.';
    }
  }

  // 2. Vértice y Rotación
  let apexText = '';
  if (isEn) {
    if (position.offsets && Math.abs(position.offsets.apex) >= LINE_OFFSET_NOTE_M) {
      apexText =
        position.offsets.apex > 0
          ? `You reach the apex ${position.offsets.apex.toFixed(1)} m wider than on your reference lap${min.delta < 0 ? ` and ${Math.abs(min.delta).toFixed(0)} km/h slower` : ''}. Turn in a touch later and aim for the inside kerb.`
          : `You reach the apex ${Math.abs(position.offsets.apex).toFixed(1)} m tighter than on your reference lap. Check you are not turning in too early and pinching the exit.`;
    } else if (position.isUndersteer) {
      apexText = `You run wide of the inside kerb and lose ${Math.abs(min.delta).toFixed(0)} km/h of apex speed to understeer.`;
    } else if (position.isEarly) {
      apexText = 'Turning in too early (early apex). You pinch the trajectory at the apex and are forced to hesitate before applying throttle.';
    } else if (min.gearDiff < 0) {
      apexText = `In ${formatGear(min.compGear, 'en')} gear instead of ${formatGear(min.refGear, 'en')}. Engine revs too high, unsettling the rear axle and hurting apex speed.`;
    } else if (min.delta < -6) {
      apexText = `Losing ${Math.abs(min.delta).toFixed(0)} km/h at the apex (${min.comp} vs ${min.ref} km/h). Release steering lock slightly to let the car roll.`;
    } else {
      apexText = `Clean apex passage clipped tight to the inside kerb (${min.comp} km/h) in optimal ${formatGear(min.compGear, 'en')} gear.`;
    }
  } else {
    if (position.offsets && Math.abs(position.offsets.apex) >= LINE_OFFSET_NOTE_M) {
      apexText =
        position.offsets.apex > 0
          ? `Llegas al ápice ${position.offsets.apex.toFixed(1)} m más abierto que en tu vuelta de referencia${min.delta < 0 ? ` y ${Math.abs(min.delta).toFixed(0)} km/h más lento` : ''}. Gira un poco más tarde y busca el piano interior.`
          : `Llegas al ápice ${Math.abs(position.offsets.apex).toFixed(1)} m más cerrado que en tu vuelta de referencia. Revisa que no estés girando antes de tiempo y estrangulando la salida.`;
    } else if (position.isUndersteer) {
      apexText = `No llegas al piano interior y pierdes ${Math.abs(min.delta).toFixed(0)} km/h de paso por curva por subviraje.`;
    } else if (position.isEarly) {
      apexText = 'Te tiras al vértice demasiado pronto (vértice prematuro). Estrangulas la salida y te ves forzado a esperar para acelerar.';
    } else if (min.gearDiff < 0) {
      apexText = `Vas en ${min.compGear}ª marcha en vez de ${min.refGear}ª. El sobrerrégimen de motor desestabiliza la zaga e impide una velocidad mínima fluida.`;
    } else if (min.delta < -6) {
      apexText = `Pérdida de ${Math.abs(min.delta).toFixed(0)} km/h en el punto de cuerda (${min.comp} vs ${min.ref} km/h). Deja correr el coche liberando volante.`;
    } else {
      apexText = `Paso por vértice óptimo pegado al piano interior (${min.comp} km/h) con marcha ${min.compGear}ª idónea.`;
    }
  }

  const throttleDelta = throttle.delta ?? 0;
  // 3. Salida y Tracción
  let exitText = '';
  if (isEn) {
    if (exit.delta < -5 && throttleDelta > 5) {
      exitText = `Having killed apex speed, you exit at ${exit.comp} km/h (${exit.delta > 0 ? '+' : ''}${exit.delta.toFixed(0)} km/h) with delayed throttle (+${Math.round(throttleDelta)}m). You bleed time all the way down the straight.`;
    } else if (exit.delta < -5) {
      exitText = `Exiting at ${exit.comp} km/h (${exit.delta.toFixed(0)} km/h) even though throttle timing is close to reference. Carrying apex speed will give you free tenths.`;
    } else if (throttleDelta > 8) {
      exitText = `Delayed throttle onset (+${Math.round(throttleDelta)}m post-apex). Start feeding 20-30% throttle earlier as you unwind the steering lock.`;
    } else {
      exitText = 'Clean and progressive traction on exit. Excellent use of track width right up to the exit kerb without lifting.';
    }
  } else {
    if (exit.delta < -5 && throttleDelta > 5) {
      exitText = `Al matar la velocidad en el vértice, sales a ${exit.comp} km/h (${exit.delta > 0 ? '+' : ''}${exit.delta.toFixed(0)} km/h) y aceleras con retraso (+${Math.round(throttleDelta)}m). Pierdes tiempo en toda la recta.`;
    } else if (exit.delta < -5) {
      exitText = `Al matar la velocidad en el vértice, sales a ${exit.comp} km/h (${exit.delta.toFixed(0)} km/h) aunque abres gas en el mismo punto que la referencia. Cuidar la velocidad mínima te dará décimas gratis.`;
    } else if (throttleDelta > 8) {
      exitText = `Aceleración retrasada (+${Math.round(throttleDelta)}m tras el vértice). Empieza a aplicar el 20-30% de acelerador antes mientras desenroscas volante.`;
    } else {
      exitText = 'Tracción limpia y progresiva a la salida. Excelente aprovechamiento del ancho de salida hacia la recta posterior.';
    }
  }

  return { entry: entryText, apex: apexText, exit: exitText };
}
