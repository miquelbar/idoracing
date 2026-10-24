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

  const refNum = comparison.ref_lap_id.replace('Lap ', '');
  const compNum = comparison.comp_lap_id.replace('Lap ', '');
  const isCrossSession = Boolean(
    comparison.ref_session_id &&
      comparison.comp_session_id &&
      comparison.ref_session_id !== comparison.comp_session_id
  );
  const refShortDate = isCrossSession && comparison.ref_date ? comparison.ref_date.slice(0, 5) : null;

  const isBrakingCorner = !isFlatOut && Math.min(minRef, minComp) < 175;
  const idealTrailPct = Math.round(selectedCorner.ideal_trail_pct ?? (Math.min(minRef, minComp) < 130 ? 55 : 45));
  const bothTrailFault = isBrakingCorner && refTrailPct < 25 && compTrailPct < 25;
  const bothThrottleFault =
    refThDist !== null && compThDist !== null && refThDist > 18 && compThDist > 18;
  const bothLapsFault = Boolean(selectedCorner.both_laps_fault || bothTrailFault || bothThrottleFault);
  const idealTimeGain =
    selectedCorner.ideal_time_gain ??
    Number((Math.max(0, selectedCorner.delta_time) + (bothLapsFault ? 0.19 : 0.08)).toFixed(3));
  const vMinIdeal = Math.round(selectedCorner.v_min_ideal ?? Math.max(minRef, minComp) + (bothLapsFault ? 3 : 2));
  const vExitIdeal = Math.round(selectedCorner.v_exit_ideal ?? Math.max(exitRef, exitComp) + 2);

  return {
    labels: {
      refNum,
      compNum,
      refShortDate,
      isCrossSession,
    },
    ideal: {
      bothLapsFault,
      bothTrailFault,
      bothThrottleFault,
      idealTrailPct,
      idealTimeGain,
      vMinIdeal,
      vExitIdeal,
    },
    braking: {
      isFlatOut,
      isBrakingCorner,
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

/** The three-step improvement plan shown under the phase table, explicitly citing P1 (V...), P2 (V...) and 👻 Ideal. */
export function buildActionPlan(
  phaseMetrics: PhaseMetrics,
  lang: string,
  cornerDeltaTime = 0
): { entry: string; apex: string; exit: string; summaryBanner?: string } {
  const isEn = lang === 'en';
  const { labels, ideal, braking, trail, position, min, throttle, exit } = phaseMetrics;
  const p1 = isEn ? `P1 (L${labels.refNum})` : `P1 (V${labels.refNum})`;
  const p2 = isEn ? `P2 (L${labels.compNum})` : `P2 (V${labels.compNum})`;
  const ghost = isEn ? '👻 Ideal Ghost' : '👻 Fantasma Ideal';

  let summaryBanner: string | undefined;
  if (cornerDeltaTime < -0.02) {
    summaryBanner = isEn
      ? `In this corner ${p2} beats ${p1} by ${cornerDeltaTime.toFixed(2)}s, but both laps still lose -${ideal.idealTimeGain.toFixed(2)}s against the ${ghost}.`
      : `En esta curva ${p2} mejora en ${cornerDeltaTime.toFixed(2)}s a ${p1}, pero ambas vueltas pierden -${ideal.idealTimeGain.toFixed(2)}s frente al ${ghost}.`;
  } else if (ideal.bothLapsFault) {
    summaryBanner = isEn
      ? `Shared technique fault in both ${p1} and ${p2}: correcting it toward the ${ghost} unlocks -${ideal.idealTimeGain.toFixed(2)}s in this corner.`
      : `Fallo técnico compartido en ${p1} y ${p2}: corregirlo siguiendo al ${ghost} desbloquea -${ideal.idealTimeGain.toFixed(2)}s en esta curva.`;
  }

  // 1. Entrada y Frenada
  let entryText = '';
  if (isEn) {
    if (braking.isFlatOut) {
      entryText = `Fast corner in ${p2} vs ${p1}: maintain full lateral support and smooth steering turn-in toward the ${ghost}.`;
    } else if (ideal.bothTrailFault) {
      entryText = `In both ${p2} (${trail.compPct}% trail) and ${p1} (${trail.refPct}% trail) you release the brake abruptly (<25%). Hold ~${ideal.idealTrailPct}% diagonal trail braking down to the apex like the ${ghost}.`;
    } else if (braking.delta < -5) {
      entryText = `In ${p2} you brake ${Math.abs(Math.round(braking.delta))}m earlier than in ${p1} (${braking.compDist}m vs ${braking.refDist}m). Delay braking toward ${p1} and bleed pressure progressively.`;
    } else if (braking.delta > 5) {
      entryText = `In ${p2} you brake ${Math.round(braking.delta)}m later than in ${p1} (${braking.compDist}m vs ${braking.refDist}m) and overslow the entry. Brake at ${braking.refDist}m (${p1}) to stabilize the front axle.`;
    } else if (trail.code === 'early_release' || (braking.isBrakingCorner && trail.compPct < 25)) {
      entryText = `In ${p2} you release the brake abruptly (${trail.compPct}% trail vs ${trail.refPct}% in ${p1}). Keep progressive trail braking (>50% in ${ghost}) to load the front nose.`;
    } else {
      entryText = `In ${p2} your braking point (${braking.compDist}m) matches ${p1} (${braking.refDist}m). Follow the ${ghost} diagonal release to carry +2 km/h into turn-in.`;
    }
  } else {
    if (braking.isFlatOut) {
      entryText = `Curva rápida en ${p2} vs ${p1}: mantén el apoyo aerodinámico sin levantar bruscamente siguiendo la envolvente del ${ghost}.`;
    } else if (ideal.bothTrailFault) {
      entryText = `Tanto en ${p2} (${trail.compPct}% trail) como en ${p1} (${trail.refPct}% trail) sueltas el freno de golpe (<25%). Mantén ~${ideal.idealTrailPct}% de regresión diagonal hasta el vértice como marca el ${ghost}.`;
    } else if (braking.delta < -5) {
      entryText = `En ${p2} frenas ${Math.abs(Math.round(braking.delta))}m antes que en ${p1} (${braking.compDist}m vs ${braking.refDist}m). Retrasa la frenada hasta la referencia de ${p1} y alarga la suelta progresiva.`;
    } else if (braking.delta > 5) {
      entryText = `En ${p2} frenas ${Math.round(braking.delta)}m después que en ${p1} (${braking.compDist}m vs ${braking.refDist}m) y entras pasado. Frena en los ${braking.refDist}m de ${p1} para no saturar el eje delantero.`;
    } else if (trail.code === 'early_release' || (braking.isBrakingCorner && trail.compPct < 25)) {
      entryText = `En ${p2} sueltas el freno bruscamente (${trail.compPct}% trail vs ${trail.refPct}% en ${p1}). Modula el pedal en regresión diagonal (>50% en ${ghost}) para clavar el morro al girar.`;
    } else {
      entryText = `En ${p2} clavas el punto de frenada con ${p1} (${braking.compDist}m vs ${braking.refDist}m). Ajusta la regresión diagonal al ${ghost} para ganar rotación en entrada.`;
    }
  }

  // 2. Vértice y Rotación
  let apexText = '';
  if (isEn) {
    if (position.offsets && Math.abs(position.offsets.apex) >= LINE_OFFSET_NOTE_M) {
      apexText =
        position.offsets.apex > 0
          ? `In ${p2} you pass the apex ${position.offsets.apex.toFixed(1)}m wider than in ${p1} (${min.comp} vs ${min.ref} km/h; ${ghost}: ${ideal.vMinIdeal} km/h). Turn in later to clip the inside kerb.`
          : `In ${p2} you pass the apex ${Math.abs(position.offsets.apex).toFixed(1)}m tighter than in ${p1} (${min.comp} vs ${min.ref} km/h). Avoid early turn-in that pinches the exit.`;
    } else if (min.gearDiff < 0) {
      apexText = `In ${p2} you drop to ${formatGear(min.compGear, 'en')} gear instead of ${formatGear(min.refGear, 'en')} in ${p1} (${min.comp} vs ${min.ref} km/h). Hold ${formatGear(min.refGear, 'en')} gear to let the chassis roll.`;
    } else if (min.delta <= -3) {
      apexText = `In ${p2} minimum apex speed drops ${Math.abs(min.delta).toFixed(0)} km/h vs ${p1} (${min.comp} vs ${min.ref} km/h; ${ghost}: ${ideal.vMinIdeal} km/h). Release steering lock slightly to carry momentum.`;
    } else if (min.delta >= 2) {
      apexText = `In ${p2} you carry +${min.delta.toFixed(0)} km/h more apex speed than in ${p1} (${min.comp} vs ${min.ref} km/h), approaching the ${ghost} target (${ideal.vMinIdeal} km/h).`;
    } else {
      apexText = `In ${p2} apex speed is ${min.comp} km/h vs ${min.ref} km/h in ${p1} (${formatGear(min.compGear, 'en')} gear). Target ${ideal.vMinIdeal} km/h (${ghost}) by rotating earlier on trail brake.`;
    }
  } else {
    if (position.offsets && Math.abs(position.offsets.apex) >= LINE_OFFSET_NOTE_M) {
      apexText =
        position.offsets.apex > 0
          ? `En ${p2} pasas por el ápice ${position.offsets.apex.toFixed(1)}m más abierto que en ${p1} (${min.comp} vs ${min.ref} km/h; ${ghost}: ${ideal.vMinIdeal} km/h). Retrasa un poco el giro y busca el piano interior.`
          : `En ${p2} pasas por el ápice ${Math.abs(position.offsets.apex).toFixed(1)}m más cerrado que en ${p1} (${min.comp} vs ${min.ref} km/h). Evita tirarte pronto al interior para no estrangular la salida.`;
    } else if (min.gearDiff < 0) {
      apexText = `En ${p2} bajas a ${min.compGear}ª marcha en vez de la ${min.refGear}ª usada en ${p1} (${min.comp} vs ${min.ref} km/h). Mantén ${min.refGear}ª para no frenar el coche con retención motor.`;
    } else if (min.delta <= -3) {
      apexText = `En ${p2} pierdes ${Math.abs(min.delta).toFixed(0)} km/h en el vértice frente a ${p1} (${min.comp} vs ${min.ref} km/h; ${ghost}: ${ideal.vMinIdeal} km/h). Libera 2-3° de volante y deja correr el coche.`;
    } else if (min.delta >= 2) {
      apexText = `En ${p2} pasas +${min.delta.toFixed(0)} km/h más rápido por el vértice que en ${p1} (${min.comp} vs ${min.ref} km/h), acercándote al objetivo del ${ghost} (${ideal.vMinIdeal} km/h).`;
    } else {
      apexText = `En ${p2} registras ${min.comp} km/h en el vértice frente a ${min.ref} km/h en ${p1} (${min.compGear}ª marcha). Apunta a los ${ideal.vMinIdeal} km/h del ${ghost} cargando mejor el tren delantero.`;
    }
  }

  const throttleDelta = throttle.delta ?? 0;
  // 3. Salida y Tracción
  let exitText = '';
  if (isEn) {
    if (ideal.bothThrottleFault) {
      exitText = `Both ${p2} (+${throttle.compDist}m) and ${p1} (+${throttle.refDist}m) delay throttle pickup after the apex. Feed the progressive throttle ramp right from the apex like the ${ghost} (${ideal.vExitIdeal} km/h).`;
    } else if (exit.delta <= -3 && throttleDelta > 4) {
      exitText = `In ${p2} you open throttle +${Math.round(throttleDelta)}m later than in ${p1} and exit at ${exit.comp} km/h vs ${exit.ref} km/h in ${p1} (${ghost}: ${ideal.vExitIdeal} km/h). Unwind wheel earlier to power out.`;
    } else if (throttleDelta > 5) {
      exitText = `In ${p2} throttle pickup is +${Math.round(throttleDelta)}m later post-apex than in ${p1} (+${throttle.compDist}m vs +${throttle.refDist}m). Start the progressive throttle ramp with ${p1} and the ${ghost}.`;
    } else if (exit.delta < -3) {
      exitText = `In ${p2} exit speed is ${exit.comp} km/h vs ${exit.ref} km/h in ${p1} (${exit.delta.toFixed(0)} km/h). Preserving apex speed toward the ${ghost} (${ideal.vExitIdeal} km/h) will carry down the straight.`;
    } else {
      exitText = `In ${p2} exit traction (${exit.comp} km/h vs ${exit.ref} km/h in ${p1}) is solid; follow the ${ghost} progressive ramp to reach ${ideal.vExitIdeal} km/h.`;
    }
  } else {
    if (ideal.bothThrottleFault) {
      exitText = `Tanto en ${p2} (+${throttle.compDist}m) como en ${p1} (+${throttle.refDist}m) demoras el gas tras el vértice. Inicia la rampa progresiva de acelerador en el ápice como el ${ghost} (${ideal.vExitIdeal} km/h).`;
    } else if (exit.delta <= -3 && throttleDelta > 4) {
      exitText = `En ${p2} abres gas +${Math.round(throttleDelta)}m más tarde que en ${p1} y sales a ${exit.comp} km/h frente a ${exit.ref} km/h en ${p1} (${ghost}: ${ideal.vExitIdeal} km/h). Abre dirección antes para traccionar.`;
    } else if (throttleDelta > 5) {
      exitText = `En ${p2} retrasas la apertura de gas +${Math.round(throttleDelta)}m tras el vértice respecto a ${p1} (+${throttle.compDist}m vs +${throttle.refDist}m). Inicia la rampa progresiva junto a ${p1} y el ${ghost}.`;
    } else if (exit.delta < -3) {
      exitText = `En ${p2} sales a ${exit.comp} km/h frente a ${exit.ref} km/h en ${p1} (${exit.delta.toFixed(0)} km/h). Mantener la velocidad de vértice del ${ghost} te dará ${ideal.vExitIdeal} km/h hacia la recta.`;
    } else {
      exitText = `En ${p2} la tracción de salida (${exit.comp} km/h vs ${exit.ref} km/h en ${p1}) es limpia; calca la rampa progresiva del ${ghost} para salir a ${ideal.vExitIdeal} km/h.`;
    }
  }

  return { entry: entryText, apex: apexText, exit: exitText, summaryBanner };
}
