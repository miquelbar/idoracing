import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gauge,
  Info,
  Lightbulb,
  Sliders,
  Wrench,
  Wind,
} from 'lucide-react';
import type { CarSetupData, SingleLapSetup } from '../types/telemetry';
import { useLanguage } from '../i18n';
import { simBadge } from '../utils/formatters';

interface CarSetupInspectorProps {
  setup: CarSetupData;
}

type SetupViewMode = 'diff' | 'p1' | 'p2';

export const CarSetupInspector: React.FC<CarSetupInspectorProps> = ({ setup }) => {
  const { t } = useLanguage();
  const badge = simBadge(setup.game_name ?? null);
  const sameGarageSetup = setup.same_garage_setup !== false;
  const garageDiffCount = setup.garage_diff_count ?? (setup.garage_diff_summary?.length || 0);
  const [viewMode, setViewMode] = useState<SetupViewMode>('diff');

  const p1: SingleLapSetup = setup.p1_setup || setup;
  const p2: SingleLapSetup = setup.p2_setup || setup;
  const activeSetup: SingleLapSetup =
    !sameGarageSetup && viewMode === 'p1' ? p1 : p2;
  const showDiff = sameGarageSetup || viewMode === 'diff';

  const p1BadgeLabel = setup.ref_lap_label || `V${setup.ref_lap_number || 1}`;
  const p2BadgeLabel = setup.comp_lap_label || `V${setup.comp_lap_number || 2}`;

  // Helper to check if a hot pressure is within the sweet spot (26.5 - 27.0 psi)
  const isOptimalPsi = (psi: number) => psi >= 26.5 && psi <= 27.0;

  const renderSmartStaticParam = (
    p1Val: number,
    p2Val: number,
    formatFn: (v: number) => string,
    deltaFormatFn: (d: number) => string,
    epsilon = 0.05
  ) => {
    if (sameGarageSetup || !showDiff || Math.abs(p2Val - p1Val) < epsilon) {
      const val = !sameGarageSetup && viewMode === 'p1' ? p1Val : p2Val;
      return <span className="text-lg font-black text-white">{formatFn(val)}</span>;
    }
    const delta = p2Val - p1Val;
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
        <span className="text-xs font-bold text-[#00D2BE]">{formatFn(p1Val)} (P1)</span>
        <span className="text-gray-500 text-xs">➔</span>
        <span className="text-base font-black text-[#D8B4FE]">{formatFn(p2Val)} (P2)</span>
        <span className="px-1.5 py-0.5 rounded bg-[#A855F7]/20 border border-[#A855F7]/40 text-[#D8B4FE] text-[10px] font-bold">
          Δ {deltaFormatFn(delta)}
        </span>
      </div>
    );
  };

  const renderTyreCorner = (
    label: string,
    cornerKey: 'FL' | 'FR' | 'RL' | 'RR'
  ) => {
    const hotP1 = p1.tyres.pressures_hot[cornerKey];
    const hotP2 = p2.tyres.pressures_hot[cornerKey];
    const hot = activeSetup.tyres.pressures_hot[cornerKey];
    const coldP1 = p1.tyres.pressures_cold[cornerKey];
    const coldP2 = p2.tyres.pressures_cold[cornerKey];
    const cold = activeSetup.tyres.pressures_cold[cornerKey];
    const tempsP1 = p1.tyres.temps_c[cornerKey] || [75, 75, 75];
    const tempsP2 = p2.tyres.temps_c[cornerKey] || [75, 75, 75];
    const temps = activeSetup.tyres.temps_c[cornerKey] || [75, 75, 75];
    const isGood = isOptimalPsi(hot);

    const deltaHot = Number((hotP2 - hotP1).toFixed(1));
    const showHotDelta = showDiff && Math.abs(deltaHot) > 0.1;
    const deltaCold = Number((coldP2 - coldP1).toFixed(1));
    const showColdDelta = !sameGarageSetup && showDiff && Math.abs(deltaCold) >= 0.1;

    const avgTempP1 = (tempsP1[0] + tempsP1[1] + tempsP1[2]) / 3;
    const avgTempP2 = (tempsP2[0] + tempsP2[1] + tempsP2[2]) / 3;
    const deltaTemp = Math.round(avgTempP2 - avgTempP1);
    const showTempDelta = showDiff && Math.abs(deltaTemp) >= 2;

    return (
      <div
        className={`p-3.5 rounded-xl border transition-all ${
          isGood
            ? 'bg-[#0E1522] border-emerald-500/40 hover:border-emerald-500/70 shadow-sm'
            : 'bg-[#15121b] border-amber-500/40 hover:border-amber-500/70 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-brand font-black text-xs uppercase tracking-wider text-white bg-white/10 px-2 py-0.5 rounded">
            {label} ({cornerKey})
          </span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-telemetry ${
              isGood
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}
          >
            {isGood ? 'Óptimo' : 'Ajustar'}
          </span>
        </div>

        {/* Hot Pressure Display (Dynamic On-Track Telemetry) */}
        <div className="flex items-baseline justify-between mb-1 gap-2">
          <span className="text-[11px] text-gray-400 font-telemetry">{t('hot_pressures')}:</span>
          <div className="text-right">
            <span
              className={`text-xl font-black font-telemetry ${
                isGood ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {hot.toFixed(1)} <span className="text-xs font-normal text-gray-400">psi</span>
            </span>
            {showHotDelta && (
              <div className="text-[10px] font-telemetry mt-0.5">
                <span className="text-[#00D2BE]">Ref P1: {hotP1.toFixed(1)} psi</span>{' '}
                <span className="px-1 py-0.5 rounded bg-white/10 text-[#D8B4FE] font-bold">
                  Δ {deltaHot > 0 ? `+${deltaHot.toFixed(1)}` : deltaHot.toFixed(1)} psi
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Cold Pressure Display (Static Garage Setup) */}
        <div className="flex items-baseline justify-between text-xs text-gray-400 font-telemetry pb-2 border-b border-white/5">
          <span>{t('cold_pressures')}:</span>
          {showColdDelta ? (
            <span className="font-semibold">
              <span className="text-[#00D2BE]">{coldP1.toFixed(1)}</span> ➔{' '}
              <span className="text-[#D8B4FE] font-bold">{coldP2.toFixed(1)} psi</span>{' '}
              <span className="text-[10px] text-[#D8B4FE]">
                (Δ {deltaCold > 0 ? `+${deltaCold.toFixed(1)}` : deltaCold.toFixed(1)})
              </span>
            </span>
          ) : (
            <span className="text-gray-300 font-semibold">
              {cold.toFixed(1)} psi{' '}
              {sameGarageSetup && (
                <span className="text-[10px] text-gray-500 font-normal">· Igual en P1/P2</span>
              )}
            </span>
          )}
        </div>

        {/* Temps Inner / Middle / Outer */}
        <div className="mt-2 pt-1 flex items-center justify-between text-[10px] font-telemetry text-gray-400">
          <span className="text-[9px] uppercase tracking-wider">I/M/O Temps:</span>
          <span className="text-gray-300 font-mono font-bold">
            {temps[0]}° / {temps[1]}° / {temps[2]}°C
            {showTempDelta && (
              <span className="ml-1 text-[#D8B4FE] font-semibold">
                (Δ {deltaTemp > 0 ? `+${deltaTemp}` : deltaTemp}°C vs P1)
              </span>
            )}
          </span>
        </div>

        {/* Dynamic Camber (I-O) and Crown (Pressure) Diagnostic */}
        {activeSetup.tyres.thermal_diagnostics?.[cornerKey] && (
          <div className="mt-2 pt-2 border-t border-white/5 space-y-1 text-[10px] font-telemetry">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Δ Caída (I-O):</span>
              <span
                className={`font-mono font-bold ${
                  activeSetup.tyres.thermal_diagnostics[cornerKey].camber_status === 'optimal'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {activeSetup.tyres.thermal_diagnostics[cornerKey].delta_camber > 0
                  ? `+${activeSetup.tyres.thermal_diagnostics[cornerKey].delta_camber}`
                  : activeSetup.tyres.thermal_diagnostics[cornerKey].delta_camber}°C
              </span>
            </div>
            <p className="text-[9px] text-gray-400 leading-tight">
              {activeSetup.tyres.thermal_diagnostics[cornerKey].camber_advice}
            </p>
          </div>
        )}
      </div>
    );
  };

  const bbChanged = !sameGarageSetup && showDiff && Math.abs(p2.electronics.brake_bias - p1.electronics.brake_bias) >= 0.05;
  const bbDelta = p2.electronics.brake_bias - p1.electronics.brake_bias;

  return (
    <div className="space-y-6">
      {/* Overview Banner — Clean Header with P1 vs P2 Lap Badges & Smart Diff Status */}
      <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-brand flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${badge.className}`}
            >
              {badge.label}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#00D2BE]/10 border border-[#00D2BE]/35 text-[#00D2BE] text-xs font-bold font-telemetry">
              <span>🔵 P1 (Ref):</span>
              <span>{p1BadgeLabel}</span>
            </span>
            <span className="text-xs text-gray-500 font-telemetry font-bold">vs</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#A855F7]/15 border border-[#A855F7]/40 text-[#D8B4FE] text-xs font-bold font-telemetry">
              <span>🟣 P2 (Comp):</span>
              <span>{p2BadgeLabel}</span>
            </span>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white font-brand tracking-wide">
              {setup.car_name}
            </h2>
            <p className="text-xs text-brand font-semibold mt-0.5">
              {setup.track_name} • {t('car_setup_desc')}
            </p>
          </div>
        </div>

        {/* Right: Identical Garage Setup Badge OR Modified Setup Segmented Control */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 self-start lg:self-auto">
          {sameGarageSetup ? (
            <div className="flex items-center gap-2 bg-emerald-950/30 px-3.5 py-2 rounded-xl border border-emerald-500/30 text-xs font-telemetry text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                ✓ Mismo Setup de Garaje en P1 y P2 · Mostrando variación térmica de neumáticos en pista (P2 vs P1)
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#A855F7]/15 border border-[#A855F7]/40 text-[#D8B4FE] text-xs font-bold font-telemetry">
                <Wrench className="w-3.5 h-3.5" />
                <span>🔧 Setup Modificado ({garageDiffCount} cambios entre P1 y P2)</span>
              </div>
              <div className="inline-flex rounded-xl bg-[#0C101A] p-1 border border-white/10 text-xs font-telemetry">
                <button
                  type="button"
                  onClick={() => setViewMode('diff')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    viewMode === 'diff'
                      ? 'bg-brand text-black shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  ⚖️ Comparar P2 vs P1 (Diff)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('p1')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    viewMode === 'p1'
                      ? 'bg-[#00D2BE]/20 text-[#00D2BE] border border-[#00D2BE]/40'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🔵 Setup P1
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('p2')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    viewMode === 'p2'
                      ? 'bg-[#A855F7]/25 text-[#D8B4FE] border border-[#A855F7]/45'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  🟣 Setup P2
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {setup.has_telemetry === false && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs font-telemetry space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Configuración base sin telemetría física a 50Hz (Solo tiempos registrados)</span>
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed">
            Las presiones en caliente y temperaturas I/M/O de neumáticos reflejan valores de partida estáticos porque esta sesión no contiene canales de acelerador, frenada o fuerzas G a 50Hz. Para calcular presiones dinámicas reales medidas en pista y el desgaste térmico de pilotaje:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="p-1.5 rounded bg-black/60 border border-white/10 text-brand text-[10px] font-mono select-all">
              /home/miquel/git/acc-coach/recorder/linux/sim-with-recorder.sh %command%
            </code>
            <span className="text-[10px] text-gray-400">
              (o ejecuta <code className="text-amber-200 font-mono">idoracing-recorder.exe -sim auto</code> en Windows)
            </span>
          </div>
        </div>
      )}

      {/* Grid: 4 Tyres & Electronics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tyres Section (7 cols) */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-telemetry">
                {t('tyres_title')}
              </h3>
            </div>
            <span className="text-[11px] font-mono font-semibold text-brand bg-brand/10 border border-brand/20 px-2.5 py-0.5 rounded-full">
              {activeSetup.tyres.compound}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center gap-2.5 text-xs text-emerald-300 font-telemetry">
            <Info className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>
              <strong>{t('target_window')}:</strong> ACC GT3 funciona con agarre máximo constante entre{' '}
              <strong className="underline">26.5 y 27.0 psi</strong> en caliente.
            </span>
          </div>

          {/* 4 Tyres Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            {renderTyreCorner('Delantero Izq.', 'FL')}
            {renderTyreCorner('Delantero Der.', 'FR')}
            {renderTyreCorner('Trasero Izq.', 'RL')}
            {renderTyreCorner('Trasero Der.', 'RR')}
          </div>
        </div>

        {/* Electronics & Driver Aids (5 cols) */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
              <Cpu className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-telemetry">
                {t('electronics_title')}
              </h3>
            </div>

            <div className="space-y-3 font-telemetry">
              {/* Brake Bias with visual slider & P1 reference marker when changed */}
              <div
                className={`p-3 rounded-xl bg-[#0C101A] border space-y-2 ${
                  bbChanged ? 'border-[#A855F7]/60 shadow-[0_0_12px_rgba(168,85,247,0.15)]' : 'border-white/5'
                }`}
              >
                <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                  <span className="text-gray-400 font-semibold uppercase">Reparto Frenada (BB):</span>
                  {bbChanged ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#00D2BE]">
                        {p1.electronics.brake_bias.toFixed(1)}% (P1)
                      </span>
                      <span className="text-gray-500">➔</span>
                      <span className="text-sm font-black text-[#D8B4FE]">
                        {p2.electronics.brake_bias.toFixed(1)}% (P2)
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#A855F7]/20 border border-[#A855F7]/40 text-[#D8B4FE] text-[10px] font-bold">
                        Δ {bbDelta > 0 ? `+${bbDelta.toFixed(1)}` : bbDelta.toFixed(1)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-base font-black text-brand">
                      {activeSetup.electronics.brake_bias.toFixed(1)}%
                    </span>
                  )}
                </div>
                {/* Visual Front/Rear Bar */}
                <div className="relative w-full bg-white/10 h-2.5 rounded-full overflow-hidden flex">
                  <div
                    className="bg-brand h-full"
                    style={{ width: `${activeSetup.electronics.brake_bias}%` }}
                    title={`Delantero: ${activeSetup.electronics.brake_bias}%`}
                  />
                  <div
                    className="bg-accent h-full"
                    style={{ width: `${100 - activeSetup.electronics.brake_bias}%` }}
                    title={`Trasero: ${(100 - activeSetup.electronics.brake_bias).toFixed(1)}%`}
                  />
                  {bbChanged && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-[#00D2BE] shadow-[0_0_6px_#00D2BE]"
                      style={{ left: `${p1.electronics.brake_bias}%` }}
                      title={`Referencia P1: ${p1.electronics.brake_bias.toFixed(1)}%`}
                    />
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                  <span>DEL {activeSetup.electronics.brake_bias.toFixed(1)}%</span>
                  <span>{(100 - activeSetup.electronics.brake_bias).toFixed(1)}% TRAS</span>
                </div>
              </div>

              {/* Grid of TC, ABS, Engine Map */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div
                  className={`p-3 rounded-xl bg-[#0C101A] border text-center ${
                    !sameGarageSetup && showDiff && p1.electronics.tc1 !== p2.electronics.tc1
                      ? 'border-[#A855F7]/60'
                      : 'border-white/5'
                  }`}
                >
                  <span className="text-[10px] text-gray-400 uppercase block mb-1">TC1</span>
                  {renderSmartStaticParam(
                    p1.electronics.tc1,
                    p2.electronics.tc1,
                    (v) => `${v}`,
                    (d) => (d > 0 ? `+${d}` : `${d}`)
                  )}
                </div>
                {activeSetup.electronics.tc2 !== undefined && (
                  <div
                    className={`p-3 rounded-xl bg-[#0C101A] border text-center ${
                      !sameGarageSetup && showDiff && (p1.electronics.tc2 ?? 4) !== (p2.electronics.tc2 ?? 4)
                        ? 'border-[#A855F7]/60'
                        : 'border-white/5'
                    }`}
                  >
                    <span className="text-[10px] text-gray-400 uppercase block mb-1">TC2 Cut</span>
                    {renderSmartStaticParam(
                      p1.electronics.tc2 ?? 4,
                      p2.electronics.tc2 ?? 4,
                      (v) => `${v}`,
                      (d) => (d > 0 ? `+${d}` : `${d}`)
                    )}
                  </div>
                )}
                <div
                  className={`p-3 rounded-xl bg-[#0C101A] border text-center ${
                    !sameGarageSetup && showDiff && p1.electronics.abs !== p2.electronics.abs
                      ? 'border-[#A855F7]/60'
                      : 'border-white/5'
                  }`}
                >
                  <span className="text-[10px] text-gray-400 uppercase block mb-1">ABS</span>
                  {renderSmartStaticParam(
                    p1.electronics.abs,
                    p2.electronics.abs,
                    (v) => `${v}`,
                    (d) => (d > 0 ? `+${d}` : `${d}`)
                  )}
                </div>
                <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5 text-center col-span-2 sm:col-span-3">
                  <div className="flex items-center justify-between text-xs px-2">
                    <span className="text-gray-400 uppercase font-semibold">Mapa Motor (ECU):</span>
                    <span className="text-sm font-black text-white">Mapa #{activeSetup.electronics.ecu_map} (Race 1)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-night-8 border border-white/5 text-[11px] text-gray-400 font-telemetry">
            Ajusta el reparto de frenada (-0.5% a -1.0%) durante la carrera si experimentas subviraje en la entrada a curva.
          </div>
        </div>
      </div>

      {/* Grid: Aero & Chassis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Aero (6 cols) */}
        <div className="lg:col-span-6 glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <Wind className="w-4 h-4 text-brand" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-telemetry">
              {t('aero_title')}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3 font-telemetry">
            <div
              className={`p-3.5 rounded-xl bg-[#0C101A] border ${
                !sameGarageSetup && showDiff && p1.aero.front_splitter !== p2.aero.front_splitter
                  ? 'border-[#A855F7]/60'
                  : 'border-white/5'
              }`}
            >
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Splitter Delantero</span>
              {renderSmartStaticParam(
                p1.aero.front_splitter,
                p2.aero.front_splitter,
                (v) => `Nivel ${v}`,
                (d) => (d > 0 ? `+${d}` : `${d}`)
              )}
            </div>
            <div
              className={`p-3.5 rounded-xl bg-[#0C101A] border ${
                !sameGarageSetup && showDiff && p1.aero.rear_wing !== p2.aero.rear_wing
                  ? 'border-[#A855F7]/60'
                  : 'border-white/5'
              }`}
            >
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Alerón Trasero (Wing)</span>
              {renderSmartStaticParam(
                p1.aero.rear_wing,
                p2.aero.rear_wing,
                (v) => `Nivel ${v}`,
                (d) => (d > 0 ? `+${d}` : `${d}`)
              )}
            </div>
            <div
              className={`p-3.5 rounded-xl bg-[#0C101A] border ${
                !sameGarageSetup && showDiff && Math.abs(p1.aero.ride_height_front_mm - p2.aero.ride_height_front_mm) >= 0.1
                  ? 'border-[#A855F7]/60'
                  : 'border-white/5'
              }`}
            >
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Altura Delantera</span>
              {renderSmartStaticParam(
                p1.aero.ride_height_front_mm,
                p2.aero.ride_height_front_mm,
                (v) => `${v} mm`,
                (d) => `${d > 0 ? `+${d}` : d} mm`
              )}
            </div>
            <div
              className={`p-3.5 rounded-xl bg-[#0C101A] border ${
                !sameGarageSetup && showDiff && Math.abs(p1.aero.ride_height_rear_mm - p2.aero.ride_height_rear_mm) >= 0.1
                  ? 'border-[#A855F7]/60'
                  : 'border-white/5'
              }`}
            >
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Altura Trasera (Rake)</span>
              {!sameGarageSetup && showDiff && Math.abs(p1.aero.ride_height_rear_mm - p2.aero.ride_height_rear_mm) >= 0.1 ? (
                renderSmartStaticParam(
                  p1.aero.ride_height_rear_mm,
                  p2.aero.ride_height_rear_mm,
                  (v) => `${v} mm`,
                  (d) => `${d > 0 ? `+${d}` : d} mm`
                )
              ) : (
                <span className="text-lg font-black text-white">
                  {activeSetup.aero.ride_height_rear_mm} mm{' '}
                  <span className="text-xs text-brand font-semibold">(+{activeSetup.aero.rake_mm}mm)</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Chassis & Suspension (6 cols) */}
        <div className="lg:col-span-6 glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3">
            <Sliders className="w-4 h-4 text-brand" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-telemetry">
              {t('chassis_title')}
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-telemetry">
            <div
              className={`p-3 rounded-xl bg-[#0C101A] border ${
                !sameGarageSetup && showDiff && p1.chassis.arb_front !== p2.chassis.arb_front
                  ? 'border-[#A855F7]/60'
                  : 'border-white/5'
              }`}
            >
              <span className="text-[10px] text-gray-400 uppercase block mb-1">ARB Delantera</span>
              {renderSmartStaticParam(
                p1.chassis.arb_front,
                p2.chassis.arb_front,
                (v) => `${v}`,
                (d) => (d > 0 ? `+${d}` : `${d}`)
              )}
            </div>
            <div
              className={`p-3 rounded-xl bg-[#0C101A] border ${
                !sameGarageSetup && showDiff && p1.chassis.arb_rear !== p2.chassis.arb_rear
                  ? 'border-[#A855F7]/60'
                  : 'border-white/5'
              }`}
            >
              <span className="text-[10px] text-gray-400 uppercase block mb-1">ARB Trasera</span>
              {renderSmartStaticParam(
                p1.chassis.arb_rear,
                p2.chassis.arb_rear,
                (v) => `${v}`,
                (d) => (d > 0 ? `+${d}` : `${d}`)
              )}
            </div>
            <div
              className={`p-3 rounded-xl bg-[#0C101A] border ${
                !sameGarageSetup && showDiff && p1.chassis.preload_diff_nm !== p2.chassis.preload_diff_nm
                  ? 'border-[#A855F7]/60'
                  : 'border-white/5'
              }`}
            >
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Diferencial (Preload)</span>
              {renderSmartStaticParam(
                p1.chassis.preload_diff_nm,
                p2.chassis.preload_diff_nm,
                (v) => `${v} Nm`,
                (d) => `${d > 0 ? `+${d}` : d} Nm`
              )}
            </div>
            <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Caída (Camber) F/R</span>
              <span className="text-xs font-mono font-bold text-white">
                {activeSetup.chassis.camber_front_deg}° / {activeSetup.chassis.camber_rear_deg}°
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5 col-span-1 sm:col-span-2">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Convergencia (Toe) F/R</span>
              <span className="text-xs font-mono font-bold text-white">
                {activeSetup.chassis.toe_front_deg > 0 ? `+${activeSetup.chassis.toe_front_deg}` : activeSetup.chassis.toe_front_deg}° /{' '}
                {activeSetup.chassis.toe_rear_deg > 0 ? `+${activeSetup.chassis.toe_rear_deg}` : activeSetup.chassis.toe_rear_deg}°
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Static setup reference notes (not telemetry-based, not Pep's opinion) */}
      <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-amber-500 space-y-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold text-white uppercase tracking-wider font-telemetry">
            {t('pep_setup_advice')}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {setup.setup_advice.map((adv, idx) => (
            <div
              key={`adv-${idx}`}
              className="p-4 rounded-xl bg-[#0B0E17] border border-white/10 hover:border-amber-500/40 transition space-y-2 flex flex-col justify-between"
            >
              <div>
                <h4 className="text-xs font-black text-amber-300 font-telemetry uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  {adv.title}
                </h4>
                <p className="text-xs text-gray-300 leading-relaxed font-sans">{adv.suggestion}</p>
              </div>
              <div className="pt-2 border-t border-white/5 mt-2">
                <span className="text-[10px] font-bold text-brand uppercase tracking-wider font-telemetry">
                  Impacto: {adv.impact}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
