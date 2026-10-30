import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gauge,
  Ghost,
  Headphones,
  Keyboard,
  Radio,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { useLanguage } from '../i18n';
import type { SpotterConfigDTO } from '../types/telemetry';
import { fetchSpotterConfig, updateSpotterConfig } from '../services/api';

function parseKeyboardEventToVK(e: KeyboardEvent): { keyName: string; vkCode: number } | null {
  const code = e.code;
  if (!code) return null;

  // Ignore standalone modifiers
  if (
    [
      'ShiftLeft',
      'ShiftRight',
      'ControlLeft',
      'ControlRight',
      'AltLeft',
      'AltRight',
      'MetaLeft',
      'MetaRight',
    ].includes(code)
  ) {
    return null;
  }

  // F1 .. F12 -> 112 .. 123
  const fMatch = code.match(/^F([1-9]|1[0-2])$/);
  if (fMatch) {
    const num = parseInt(fMatch[1], 10);
    return { keyName: `F${num}`, vkCode: 111 + num };
  }

  // KeyA .. KeyZ -> 65 .. 90
  const keyMatch = code.match(/^Key([A-Z])$/);
  if (keyMatch) {
    const char = keyMatch[1];
    return { keyName: char, vkCode: char.charCodeAt(0) };
  }

  // Digit0 .. Digit9 -> 48 .. 57
  const digitMatch = code.match(/^Digit([0-9])$/);
  if (digitMatch) {
    const char = digitMatch[1];
    return { keyName: char, vkCode: char.charCodeAt(0) };
  }

  // Numpad0 .. Numpad9 -> 96 .. 105
  const numpadMatch = code.match(/^Numpad([0-9])$/);
  if (numpadMatch) {
    const num = parseInt(numpadMatch[1], 10);
    return { keyName: `NUM${num}`, vkCode: 96 + num };
  }

  if (code === 'Space') return { keyName: 'SPACE', vkCode: 32 };
  if (code === 'Tab') return { keyName: 'TAB', vkCode: 9 };
  if (code === 'Backquote') return { keyName: '`', vkCode: 192 };
  if (code === 'Minus') return { keyName: '-', vkCode: 189 };
  if (code === 'Equal') return { keyName: '=', vkCode: 187 };
  if (code === 'BracketLeft') return { keyName: '[', vkCode: 219 };
  if (code === 'BracketRight') return { keyName: ']', vkCode: 221 };
  if (code === 'Semicolon') return { keyName: ';', vkCode: 186 };
  if (code === 'Quote') return { keyName: "'", vkCode: 222 };
  if (code === 'Comma') return { keyName: ',', vkCode: 188 };
  if (code === 'Period') return { keyName: '.', vkCode: 190 };
  if (code === 'Slash') return { keyName: '/', vkCode: 191 };
  if (code === 'Backslash') return { keyName: '\\', vkCode: 220 };
  if (code === 'Insert') return { keyName: 'INS', vkCode: 45 };
  if (code === 'Delete') return { keyName: 'DEL', vkCode: 46 };
  if (code === 'Home') return { keyName: 'HOME', vkCode: 36 };
  if (code === 'End') return { keyName: 'END', vkCode: 35 };
  if (code === 'PageUp') return { keyName: 'PGUP', vkCode: 33 };
  if (code === 'PageDown') return { keyName: 'PGDN', vkCode: 34 };

  return null;
}

export interface SpotterInfoCardProps {
  /** If true, the card can be collapsed into a compact quick bar. Defaults to false. */
  collapsible?: boolean;
  /** Initial collapsed state when collapsible is true. Defaults to true. */
  defaultCollapsed?: boolean;
  /** If true, displays the 3-step operation flow and offline fallback guarantee. */
  showGuide?: boolean;
  /** If true, displays the hotkey remapping card and interactive listener. */
  showHotkey?: boolean;
}

export const SpotterInfoCard: React.FC<SpotterInfoCardProps> = ({
  collapsible = false,
  defaultCollapsed = true,
  showGuide,
  showHotkey,
}) => {
  const guideVisible = showGuide !== undefined ? showGuide : !collapsible;
  const hotkeyVisible = showHotkey !== undefined ? showHotkey : !collapsible;

  const { lang, t } = useLanguage();
  const [isCollapsed, setIsCollapsed] = useState(collapsible ? defaultCollapsed : false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [spotterConfig, setSpotterConfig] = useState<SpotterConfigDTO>({
    enabled: true,
    language: 'es',
    volume: 85,
    toggle_key: 'F9',
    toggle_vk_code: 120,
  });

  useEffect(() => {
    fetchSpotterConfig()
      .then((cfg) => {
        setSpotterConfig(cfg);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isListening) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        setIsListening(false);
        return;
      }

      const parsed = parseKeyboardEventToVK(e);
      if (parsed) {
        const { keyName, vkCode } = parsed;
        setSpotterConfig((prev) => ({
          ...prev,
          toggle_key: keyName,
          toggle_vk_code: vkCode,
        }));
        updateSpotterConfig({
          toggle_key: keyName,
          toggle_vk_code: vkCode,
        }).catch(() => {});
        setIsListening(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isListening]);

  const handleTestVoice = () => {
    try {
      setIsPlaying(true);
      const audio = new Audio(`/api/spotter/audio/radio_start_guided?lang=${spotterConfig.language || lang}`);
      audio.volume = Math.max(0.1, Math.min(1.0, (spotterConfig.volume || 85) / 100));
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      audio.play().catch(() => setIsPlaying(false));
    } catch {
      setIsPlaying(false);
    }
  };

  const handleToggleActive = () => {
    const nextEnabled = !spotterConfig.enabled;
    setSpotterConfig((prev) => ({ ...prev, enabled: nextEnabled }));
    updateSpotterConfig({ enabled: nextEnabled }).catch(() => {});
  };

  // 1. Compact Collapsed View (Ideal for Debrief)
  if (collapsible && isCollapsed) {
    return (
      <div className="p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-[#121824] via-[#0E131E] to-[#0A0D14] border border-[#232D42] shadow-md flex flex-wrap items-center justify-between gap-2.5 transition-all">
        {/* Identity & 3 Essential Controls: Active, Volume, Language */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand shadow-[0_0_10px_rgba(0,210,190,0.2)]">
              <Headphones className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-white tracking-wide">
              Pep · Radio
            </span>
          </div>

          {/* 1. Radio Activa / Silenciada Toggle */}
          <button
            type="button"
            onClick={handleToggleActive}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold font-telemetry tracking-wide transition cursor-pointer flex items-center gap-1.5 ${
              spotterConfig.enabled
                ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                : 'bg-night-8 border-gray-700 text-gray-400 hover:text-gray-200'
            }`}
            title="Activar o silenciar avisos de audio en vivo de Pep"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${spotterConfig.enabled ? 'bg-emerald-400 animate-ping' : 'bg-gray-500'}`} />
            <span>{spotterConfig.enabled ? 'Radio Activa' : 'Silenciada'}</span>
          </button>

          {/* 2. Volumen badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/40 border border-white/5 text-[11px] font-mono text-gray-300"
            title={`Volumen: ${spotterConfig.volume || 85}%`}
          >
            <Volume2 className="w-3.5 h-3.5 text-brand" />
            <span className="font-bold text-brand">{spotterConfig.volume || 85}%</span>
          </div>

          {/* 3. Idioma Quick Toggle */}
          <div className="flex items-center rounded-lg bg-black/40 border border-white/5 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                const nextLang = spotterConfig.language === 'es' ? 'en' : 'es';
                setSpotterConfig((prev) => ({ ...prev, language: nextLang }));
                updateSpotterConfig({ language: nextLang }).catch(() => {});
              }}
              className="px-2 py-0.5 rounded text-gray-300 hover:text-white font-telemetry cursor-pointer flex items-center gap-1 transition"
              title="Cambiar idioma (Español / English)"
            >
              <span>{spotterConfig.language === 'es' ? '🇪🇸 ES' : '🇬🇧 EN'}</span>
            </button>
          </div>
        </div>

        {/* Right: Audio Test & Expand Button */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={handleTestVoice}
            disabled={isPlaying}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1E2738] hover:bg-[#28344B] border border-white/10 text-[11px] text-gray-200 transition cursor-pointer disabled:opacity-50"
            title="Escuchar audio de prueba"
          >
            <Volume2 className={`w-3.5 h-3.5 ${isPlaying ? 'text-brand animate-bounce' : 'text-gray-400'}`} />
            <span className="font-semibold hidden sm:inline">{isPlaying ? '...' : 'Probar'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-telemetry text-gray-300 hover:text-white transition cursor-pointer"
            title="Desplegar controles de Pep"
          >
            <span>Ajustar</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // 2. Full / Expanded View
  return (
    <div className="space-y-4">
      {/* Main Panel */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#121824] via-[#0E131E] to-[#0A0D14] border border-[#232D42] shadow-[0_10px_30px_rgba(0,0,0,0.5)] space-y-4">
        {/* Header with Title and Global Radio Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand/10 border border-brand/30 text-brand shadow-[0_0_15px_rgba(0,210,190,0.2)]">
              <Headphones className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white tracking-wide">
                  Pep · Live Spotter & Pit-Wall Radio
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-brand/15 border border-brand/40 text-[10px] font-bold text-brand font-telemetry tracking-wide uppercase">
                  50 Hz · Zero-Lag
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-sans mt-0.5">
                Ingeniero de pista por voz dentro del juego. Canta frenadas, velocidad de vértice y presiones.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleActive}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold font-telemetry tracking-wider uppercase transition cursor-pointer flex items-center gap-2 ${
                spotterConfig.enabled
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                  : 'bg-night-8 border-gray-700 text-gray-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${spotterConfig.enabled ? 'bg-emerald-400 animate-ping' : 'bg-gray-500'}`} />
              <span>{spotterConfig.enabled ? 'Radio Activa' : 'Radio Silenciada'}</span>
            </button>

            <button
              type="button"
              onClick={handleTestVoice}
              disabled={isPlaying}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1E2738] hover:bg-[#28344B] border border-white/10 text-xs text-gray-200 transition cursor-pointer disabled:opacity-50"
              title="Escuchar audio de prueba"
            >
              <Volume2 className={`w-4 h-4 ${isPlaying ? 'text-brand animate-bounce' : 'text-gray-400'}`} />
              <span className="font-semibold hidden sm:inline">{isPlaying ? 'Reproduciendo...' : 'Probar Radio'}</span>
            </button>

            {collapsible && (
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-telemetry text-gray-300 hover:text-white transition cursor-pointer"
                title="Plegar panel de Pep"
              >
                <span>Plegar</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Interactive Controls (Volume, Language, and Hotkey if enabled) */}
        <div className={`grid grid-cols-1 ${hotkeyVisible ? 'md:grid-cols-3' : 'sm:grid-cols-2'} gap-3`}>
          {/* Card 1: In-Game Hotkey (only in full settings view) */}
          {hotkeyVisible && (
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2 flex flex-col justify-between hover:border-brand/30 transition">
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Keyboard className="w-3.5 h-3.5 text-brand" />
                    Tecla en Pista (Mute/Unmute)
                  </span>
                  <span className="text-[10px] text-gray-500 font-telemetry">HotKey</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed font-sans">
                  Pulsa en carrera para silenciar a Pep o reactivarlo. El grabador la lee directamente en memoria.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                <div className="px-3 py-1 rounded-lg bg-[#080B10] border border-brand/50 text-brand font-mono font-black text-xs shadow-[0_0_15px_rgba(0,210,190,0.2)] tracking-wider">
                  ⌨️ {spotterConfig.toggle_key || 'F9'}
                </div>
                <button
                  type="button"
                  onClick={() => setIsListening(true)}
                  className="px-2.5 py-1 rounded-lg bg-brand hover:bg-brand-light text-black font-bold text-[11px] uppercase tracking-wider transition cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Keyboard className="w-3 h-3" />
                  <span>{t('spotter_change_key_btn')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Card 2: Volume Slider */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2 flex flex-col justify-between hover:border-brand/30 transition">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-brand" />
                  Volumen de Radio
                </span>
                <span className="text-xs font-mono font-bold text-brand">{spotterConfig.volume || 85}%</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed font-sans">
                Nivel de salida de las transmisiones de radio de Pep sobre el sonido del motor.
              </p>
            </div>

            <div className="pt-2 border-t border-white/5 space-y-1">
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={spotterConfig.volume || 85}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSpotterConfig((prev) => ({ ...prev, volume: val }));
                  updateSpotterConfig({ volume: val }).catch(() => {});
                }}
                className="w-full accent-brand cursor-pointer h-1.5 bg-night-8 rounded-lg"
              />
              <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                <span>10%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          {/* Card 3: Language Selector */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 space-y-2 flex flex-col justify-between hover:border-brand/30 transition">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-brand" />
                  Idioma de Radio
                </span>
                <span className="text-[10px] text-gray-500 font-telemetry">Filtro GT3</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed font-sans">
                Voces sintetizadas con ecualización de paso de banda y compresor de muro de pits.
              </p>
            </div>

            <div className="pt-2 border-t border-white/5">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-night-8 border border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setSpotterConfig((prev) => ({ ...prev, language: 'es' }));
                    updateSpotterConfig({ language: 'es' }).catch(() => {});
                  }}
                  className={`py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    spotterConfig.language === 'es'
                      ? 'bg-brand text-black shadow-sm font-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span>🇪🇸</span>
                  <span>Español</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpotterConfig((prev) => ({ ...prev, language: 'en' }));
                    updateSpotterConfig({ language: 'en' }).catch(() => {});
                  }}
                  className={`py-1.5 rounded-md text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    spotterConfig.language === 'en'
                      ? 'bg-brand text-black shadow-sm font-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <span>🇬🇧</span>
                  <span>English</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Guide & Architecture (Only in SettingsView or when showGuide is explicitly true) */}
        {guideVisible ? (
          <>
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <span>⚙️ Flujo de Operación y Calibración Automática</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Step 1 */}
                <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1 hover:border-emerald-500/30 transition">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <Gauge className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>1. Calibración Silenciosa</span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
                    En circuitos nuevos, Pep graba telemetría en silencio. Solo cantará vueltas rápidas personales (PB) y alertas de presión caliente (&gt;27.3 psi).
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1 hover:border-comp/30 transition">
                  <div className="flex items-center gap-2 text-xs font-bold text-comp">
                    <Ghost className="w-3.5 h-3.5 text-comp shrink-0" />
                    <span>2. Detección de Curvas Críticas</span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
                    Al abrir la app tras tu tanda, Pep compara con la 👻 Bubota, detecta las 3 curvas con mayor pérdida y deja guardadas las referencias de frenada.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1 hover:border-brand/30 transition">
                  <div className="flex items-center gap-2 text-xs font-bold text-brand">
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand shrink-0" />
                    <span>3. Guiado en Pista a 50Hz</span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed font-sans">
                    En tu siguiente tanda, Pep canta el punto de frenada 250m antes de la curva y evalúa el ápice. Pulsa{' '}
                    <strong className="text-brand font-mono font-bold">{spotterConfig.toggle_key || 'F9'}</strong> para silenciarlo o activarlo en cualquier momento.
                  </p>
                </div>
              </div>
            </div>

            {/* Autonomous Offline Fallback Guarantee */}
            <div className="p-3 rounded-xl bg-[#090D14] border border-brand/20 flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-brand/10 text-brand shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <p className="text-xs text-gray-300 leading-relaxed font-sans">
                <strong className="text-brand font-semibold">Garantía 100% Autónoma sin Servidor:</strong> En trazados sin referencias previas o jugando con la app web cerrada, Pep utiliza automáticamente los 20 audios base universales (<code className="text-brand">turn_1</code> a <code className="text-brand">turn_20</code>) ya incluidos. Nunca te quedarás sin avisos en carrera.
              </p>
            </div>
          </>
        ) : (
          /* Sleek footnote when guide is omitted (Debrief context) */
          <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-white/5 font-sans">
            <span className="flex items-center gap-1.5">
              <span>💡</span>
              <span>Tecla en pista por defecto: <strong className="text-brand font-mono">{spotterConfig.toggle_key || 'F9'}</strong> (Mute/Unmute). En <strong className="text-gray-300">Ajustes</strong> tienes la reasignación de tecla y el tutorial completo.</span>
            </span>
          </div>
        )}
      </div>

      {/* 5. Interactive Key Listener Modal */}
      {isListening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl bg-[#0D121D] border-2 border-brand/60 shadow-[0_0_60px_rgba(0,210,190,0.3)] space-y-5 text-center">
            <div className="inline-flex p-4 rounded-2xl bg-brand/10 border border-brand/30 text-brand shadow-inner">
              <Keyboard className="w-10 h-10 animate-bounce" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base sm:text-lg font-bold text-white tracking-wide">
                Reasignar Tecla de Radio en Pista
              </h4>
              <p className="text-xs sm:text-sm text-gray-300 leading-relaxed font-sans">
                {t('spotter_press_key_prompt')}
              </p>
            </div>
            <div className="py-2">
              <div className="inline-block px-6 py-3 rounded-xl bg-night-8 border-2 border-brand/50 text-brand font-mono text-base tracking-widest font-black animate-pulse shadow-lg">
                [ {t('spotter_listening_key')} ]
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Soporta F1-F12, letras (A-Z), números, teclado numérico, Espacio, Tab, Insert, Delete, etc.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
