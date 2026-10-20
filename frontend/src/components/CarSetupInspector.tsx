import React from 'react';
import {
  CheckCircle2,
  Cpu,
  Gauge,
  Info,
  Lightbulb,
  Sliders,
  Wind,
} from 'lucide-react';
import type { CarSetupData } from '../types/telemetry';
import { useLanguage } from '../i18n';
import { simBadge } from '../utils/formatters';

interface CarSetupInspectorProps {
  setup: CarSetupData;
}

export const CarSetupInspector: React.FC<CarSetupInspectorProps> = ({ setup }) => {
  const { t } = useLanguage();
  const badge = simBadge(setup.game_name ?? null);

  // Helper to check if a hot pressure is within the sweet spot (26.5 - 27.0 psi)
  const isOptimalPsi = (psi: number) => psi >= 26.5 && psi <= 27.0;

  const renderTyreCorner = (
    label: string,
    cornerKey: 'FL' | 'FR' | 'RL' | 'RR'
  ) => {
    const hot = setup.tyres.pressures_hot[cornerKey];
    const cold = setup.tyres.pressures_cold[cornerKey];
    const temps = setup.tyres.temps_c[cornerKey] || [75, 75, 75];
    const isGood = isOptimalPsi(hot);

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

        {/* Hot Pressure Display */}
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[11px] text-gray-400 font-telemetry">{t('hot_pressures')}:</span>
          <span
            className={`text-xl font-black font-telemetry ${
              isGood ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {hot.toFixed(1)} <span className="text-xs font-normal text-gray-400">psi</span>
          </span>
        </div>

        {/* Cold Pressure Display */}
        <div className="flex items-baseline justify-between text-xs text-gray-400 font-telemetry pb-2 border-b border-white/5">
          <span>{t('cold_pressures')}:</span>
          <span className="text-gray-300 font-semibold">{cold.toFixed(1)} psi</span>
        </div>

        {/* Temps Inner / Middle / Outer */}
        <div className="mt-2 pt-1 flex items-center justify-between text-[10px] font-telemetry text-gray-400">
          <span className="text-[9px] uppercase tracking-wider">I/M/O Temps:</span>
          <span className="text-gray-300 font-mono font-bold">
            {temps[0]}° / {temps[1]}° / {temps[2]}°C
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-brand flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${badge.className}`}
            >
              {badge.label}
            </span>
            <span className="text-xs font-bold text-gray-400 font-telemetry uppercase tracking-wider">
              {setup.session_id}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white font-brand tracking-wide">
            {setup.car_name}
          </h2>
          <p className="text-xs text-brand font-semibold mt-0.5">
            {setup.track_name} • {t('car_setup_desc')}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto bg-white/5 px-3 py-2 rounded-xl border border-white/10 text-xs font-telemetry">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-gray-300 font-medium">Telemetry Config Extracted</span>
        </div>
      </div>

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
              {setup.tyres.compound}
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
              {/* Brake Bias with visual slider */}
              <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-semibold uppercase">Reparto Frenada (BB):</span>
                  <span className="text-base font-black text-brand">
                    {setup.electronics.brake_bias.toFixed(1)}%
                  </span>
                </div>
                {/* Visual Front/Rear Bar */}
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-brand h-full"
                    style={{ width: `${setup.electronics.brake_bias}%` }}
                    title={`Delantero: ${setup.electronics.brake_bias}%`}
                  />
                  <div
                    className="bg-accent h-full"
                    style={{ width: `${100 - setup.electronics.brake_bias}%` }}
                    title={`Trasero: ${(100 - setup.electronics.brake_bias).toFixed(1)}%`}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                  <span>DEL {setup.electronics.brake_bias}%</span>
                  <span>{(100 - setup.electronics.brake_bias).toFixed(1)}% TRAS</span>
                </div>
              </div>

              {/* Grid of TC, ABS, Engine Map */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5 text-center">
                  <span className="text-[10px] text-gray-400 uppercase block mb-1">TC1</span>
                  <span className="text-xl font-black text-white">{setup.electronics.tc1}</span>
                </div>
                {setup.electronics.tc2 !== undefined && (
                  <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5 text-center">
                    <span className="text-[10px] text-gray-400 uppercase block mb-1">TC2 Cut</span>
                    <span className="text-xl font-black text-white">{setup.electronics.tc2}</span>
                  </div>
                )}
                <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5 text-center">
                  <span className="text-[10px] text-gray-400 uppercase block mb-1">ABS</span>
                  <span className="text-xl font-black text-white">{setup.electronics.abs}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5 text-center col-span-2 sm:col-span-3">
                  <div className="flex items-center justify-between text-xs px-2">
                    <span className="text-gray-400 uppercase font-semibold">Mapa Motor (ECU):</span>
                    <span className="text-sm font-black text-white">Mapa #{setup.electronics.ecu_map} (Race 1)</span>
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
            <div className="p-3.5 rounded-xl bg-[#0C101A] border border-white/5">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Splitter Delantero</span>
              <span className="text-xl font-black text-white">Nivel {setup.aero.front_splitter}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0C101A] border border-white/5">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Alerón Trasero (Wing)</span>
              <span className="text-xl font-black text-white">Nivel {setup.aero.rear_wing}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0C101A] border border-white/5">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Altura Delantera</span>
              <span className="text-lg font-black text-white">{setup.aero.ride_height_front_mm} mm</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0C101A] border border-white/5">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Altura Trasera (Rake)</span>
              <span className="text-lg font-black text-white">
                {setup.aero.ride_height_rear_mm} mm{' '}
                <span className="text-xs text-brand font-semibold">(+{setup.aero.rake_mm}mm)</span>
              </span>
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
            <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">ARB Delantera</span>
              <span className="text-lg font-black text-white">{setup.chassis.arb_front}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">ARB Trasera</span>
              <span className="text-lg font-black text-white">{setup.chassis.arb_rear}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Diferencial (Preload)</span>
              <span className="text-lg font-black text-white">{setup.chassis.preload_diff_nm} Nm</span>
            </div>
            <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Caída (Camber) F/R</span>
              <span className="text-xs font-mono font-bold text-white">
                {setup.chassis.camber_front_deg}° / {setup.chassis.camber_rear_deg}°
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#0C101A] border border-white/5 col-span-1 sm:col-span-2">
              <span className="text-[10px] text-gray-400 uppercase block mb-1">Convergencia (Toe) F/R</span>
              <span className="text-xs font-mono font-bold text-white">
                {setup.chassis.toe_front_deg > 0 ? `+${setup.chassis.toe_front_deg}` : setup.chassis.toe_front_deg}° /{' '}
                {setup.chassis.toe_rear_deg > 0 ? `+${setup.chassis.toe_rear_deg}` : setup.chassis.toe_rear_deg}°
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pep AI Race Engineer Recommendations Section */}
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
