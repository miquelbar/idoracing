import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AppWindow,
  ExternalLink,
  Headphones,
  Radio,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  closeNativeHud,
  fetchNativeHudStatus,
  fetchSpotterConfig,
  launchNativeHud,
  updateSpotterConfig,
} from '../services/api';
import type { SpotterConfigDTO } from '../types/telemetry';

interface LiveTelemetryFrame {
  rpm: number;
  max_rpm: number;
  gear: number;
  speed_kmh: number;
  gas: number;
  brake: number;
  tc?: number;
  abs?: number;
  in_pit?: number;
}

interface SamplePoint {
  time: number;
  gas: number;
  brake: number;
}

const HISTORY_SECONDS = 3.5;

export const HudView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const samplesRef = useRef<SamplePoint[]>([]);
  const latestFrameRef = useRef<LiveTelemetryFrame>({
    rpm: 0,
    max_rpm: 8500,
    gear: 0,
    speed_kmh: 0,
    gas: 0,
    brake: 0,
  });

  const [connected, setConnected] = useState(false);
  const [nativeHudRunning, setNativeHudRunning] = useState(false);
  const [nativeHudPid, setNativeHudPid] = useState<number | undefined>();
  const [spotterConfig, setSpotterConfig] = useState<SpotterConfigDTO>({
    enabled: true,
    language: 'es',
    volume: 85,
  });
  const [liveReadout, setLiveReadout] = useState({
    gas: 0,
    brake: 0,
    gear: 0,
    speed: 0,
    rpm: 0,
    maxRpm: 8500,
  });

  // Load spotter config and native HUD status on mount
  useEffect(() => {
    fetchSpotterConfig()
      .then((cfg) => setSpotterConfig(cfg))
      .catch(() => {});

    const checkHudStatus = () => {
      fetchNativeHudStatus()
        .then((res) => {
          setNativeHudRunning(res.running);
          setNativeHudPid(res.pid);
        })
        .catch(() => {});
    };

    checkHudStatus();
    const interval = setInterval(checkHudStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket Live Telemetry Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: number | undefined;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/live/ws`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: LiveTelemetryFrame = JSON.parse(event.data);
          const now = performance.now() / 1000;
          latestFrameRef.current = data;

          samplesRef.current.push({
            time: now,
            gas: Math.max(0, Math.min(1, data.gas ?? 0)),
            brake: Math.max(0, Math.min(1, data.brake ?? 0)),
          });

          // Keep within reasonable buffer size
          if (samplesRef.current.length > 500) {
            samplesRef.current = samplesRef.current.slice(-300);
          }

          setLiveReadout({
            gas: Math.round((data.gas ?? 0) * 100),
            brake: Math.round((data.brake ?? 0) * 100),
            gear: data.gear ?? 0,
            speed: Math.round(data.speed_kmh ?? 0),
            rpm: data.rpm ?? 0,
            maxRpm: data.max_rpm > 0 ? data.max_rpm : 8500,
          });
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimeout = window.setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  // Canvas 60 FPS Oscilloscope Rendering Loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Ensure crisp high-DPI rendering
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const w = displayWidth;
      const h = displayHeight;

      // 1. Dark background
      ctx.fillStyle = 'rgba(10, 13, 20, 0.96)';
      ctx.fillRect(0, 0, w, h);

      // Usable chart bounds
      const marginLeft = 46;
      const marginRight = 20;
      const marginTop = 20;
      const marginBottom = 28;
      const gw = w - marginLeft - marginRight;
      const gh = h - marginTop - marginBottom;

      if (gw > 20 && gh > 20) {
        // 2. Horizontal grid lines (0%, 25%, 50%, 75%, 100%)
        const gridMarks = [
          { val: 0.0, label: '0%' },
          { val: 0.25, label: '25%' },
          { val: 0.5, label: '50%' },
          { val: 0.75, label: '75%' },
          { val: 1.0, label: '100%' },
        ];

        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        gridMarks.forEach(({ val, label }) => {
          const y = marginTop + gh * (1.0 - val);

          // Grid Line
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.moveTo(marginLeft, y);
          ctx.lineTo(marginLeft + gw, y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Grid Label
          ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
          ctx.fillText(label, marginLeft - 8, y);
        });

        const now = performance.now() / 1000;
        const samples = samplesRef.current;
        const tMin = now - HISTORY_SECONDS;

        // Clean out ancient samples
        while (samples.length > 0 && samples[0].time < tMin - 1.0) {
          samples.shift();
        }

        if (samples.length > 1) {
          // 3. Render Throttle (Neon Green #22c55e)
          ctx.beginPath();
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          let firstGas = true;
          for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            if (s.time < tMin) continue;
            const x = marginLeft + ((s.time - tMin) / HISTORY_SECONDS) * gw;
            const y = marginTop + gh * (1.0 - s.gas);
            if (firstGas) {
              ctx.moveTo(x, y);
              firstGas = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();

          // 4. Render Brake / Trail Braking (Racing Red #ef4444)
          ctx.beginPath();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          let firstBrake = true;
          for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            if (s.time < tMin) continue;
            const x = marginLeft + ((s.time - tMin) / HISTORY_SECONDS) * gw;
            const y = marginTop + gh * (1.0 - s.brake);
            if (firstBrake) {
              ctx.moveTo(x, y);
              firstBrake = false;
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        } else {
          // Waiting for telemetry indicator
          ctx.font = '13px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
          ctx.fillText('Waiting for 50Hz live telemetry (ACC, LMU, AC...)...', marginLeft + gw / 2, marginTop + gh / 2);
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Radio Pep Handlers
  const handleToggleSpotter = () => {
    const nextEnabled = !spotterConfig.enabled;
    setSpotterConfig((prev) => ({ ...prev, enabled: nextEnabled }));
    updateSpotterConfig({ enabled: nextEnabled }).catch(() => {});
  };

  const handleVolumeChange = (vol: number) => {
    setSpotterConfig((prev) => ({ ...prev, volume: vol }));
    updateSpotterConfig({ volume: vol }).catch(() => {});
  };

  const handleLanguageChange = (lang: 'es' | 'en') => {
    setSpotterConfig((prev) => ({ ...prev, language: lang }));
    updateSpotterConfig({ language: lang }).catch(() => {});
  };

  // Native Overlay Launch / Close Handlers
  const handleLaunchNative = async () => {
    try {
      const res = await launchNativeHud();
      setNativeHudRunning(true);
      setNativeHudPid(res.pid);
    } catch {
      // Ignored
    }
  };

  const handleCloseNative = async () => {
    try {
      await closeNativeHud();
      setNativeHudRunning(false);
      setNativeHudPid(undefined);
    } catch {
      // Ignored
    }
  };

  const isTrailing = liveReadout.brake > 5 && liveReadout.brake < 85;
  const rpmPct = Math.min(100, Math.max(0, (liveReadout.rpm / (liveReadout.maxRpm || 8500)) * 100));
  const gearLabel = liveReadout.gear === -1 ? 'R' : liveReadout.gear === 0 ? 'N' : liveReadout.gear;

  return (
    <div className="flex flex-col gap-4 max-w-5xl mx-auto p-3 sm:p-5">
      {/* Top Banner: Status & Quick Controls */}
      <div className="flex items-center justify-between gap-3 bg-[#111622] border border-white/10 rounded-2xl p-4 shadow-xl flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#1E2638] to-[#0D111A] border border-white/10 shadow-inner">
            <Activity className="w-5 h-5 text-brand" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-brand font-black text-white italic tracking-wide">
                TRAIL BRAKING & THROTTLE HUD
              </h1>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  connected
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {connected ? '● Live' : '○ Waiting for Sim'}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              50Hz pedal oscilloscope to master your brake trail release and throttle ramp.
            </p>
          </div>
        </div>

        {/* Pep Radio Quick Controller */}
        <div className="flex items-center gap-2.5 bg-[#0D111A] border border-white/10 rounded-xl px-3 py-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300">
            <Radio className="w-4 h-4 text-brand" />
            <span>Pep Radio:</span>
          </div>

          <button
            onClick={handleToggleSpotter}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              spotterConfig.enabled
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
            }`}
          >
            {spotterConfig.enabled ? (
              <>
                <Volume2 className="w-3.5 h-3.5" />
                <span>Active</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>Muted</span>
              </>
            )}
          </button>

          {/* Volume Slider */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Headphones className="w-3.5 h-3.5" />
            <input
              type="range"
              min="0"
              max="100"
              value={spotterConfig.volume ?? 85}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-brand"
            />
            <span className="font-mono text-[11px] text-gray-300 min-w-[28px]">
              {spotterConfig.volume ?? 85}%
            </span>
          </div>

          {/* Language Switch */}
          <div className="flex rounded-md bg-white/5 p-0.5 border border-white/10">
            <button
              onClick={() => handleLanguageChange('es')}
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                spotterConfig.language === 'es' ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              ES
            </button>
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                spotterConfig.language === 'en' ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Oscilloscope Display */}
      <div className="relative bg-[#0A0D14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <canvas
          ref={canvasRef}
          className="w-full h-[260px] sm:h-[320px] block"
          style={{ imageRendering: 'auto' }}
        />

        {/* Live Gauges Readout Overlay */}
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-[#121824]/90 backdrop-blur-md border border-white/15 rounded-xl px-3 py-1.5 shadow-lg">
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Gear</span>
            <span className="text-xl font-mono font-black text-amber-400">{gearLabel}</span>
          </div>
          <div className="h-6 w-px bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Speed</span>
            <span className="text-xl font-mono font-black text-white">{liveReadout.speed} <span className="text-[10px] font-normal text-gray-400">km/h</span></span>
          </div>
        </div>

        {/* Live Pedal Badges Bar */}
        <div className="flex items-center justify-between gap-3 bg-[#0E121B] border-t border-white/10 px-4 py-3 flex-wrap">
          <div className="flex items-center gap-6">
            {/* Throttle Gauge */}
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-black tracking-wider text-emerald-400 font-mono">THROTTLE</span>
              <div className="w-28 sm:w-40 h-3 bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/10">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(34,197,94,0.6)]"
                  style={{ width: `${liveReadout.gas}%` }}
                />
              </div>
              <span className="font-mono text-sm font-black text-emerald-400 min-w-[38px]">
                {liveReadout.gas}%
              </span>
            </div>

            {/* Brake / Trail Braking Gauge */}
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-black tracking-wider text-rose-400 font-mono">BRAKE</span>
              <div className="w-28 sm:w-40 h-3 bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/10">
                <div
                  className="h-full bg-rose-500 rounded-full transition-all duration-75 shadow-[0_0_10px_rgba(239,68,68,0.6)]"
                  style={{ width: `${liveReadout.brake}%` }}
                />
              </div>
              <span className="font-mono text-sm font-black text-rose-400 min-w-[38px]">
                {liveReadout.brake}%
              </span>
              {isTrailing && (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                  Trail Braking
                </span>
              )}
            </div>
          </div>

          {/* RPM Rev Bar */}
          <div className="flex items-center gap-2 min-w-[140px]">
            <span className="text-[10px] font-mono text-gray-400 uppercase">RPM</span>
            <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden border border-white/10">
              <div
                className={`h-full transition-all duration-75 ${
                  rpmPct > 95 ? 'bg-rose-500 animate-pulse' : rpmPct > 80 ? 'bg-amber-400' : 'bg-brand'
                }`}
                style={{ width: `${rpmPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Overlay Window Launcher & Controls Card */}
      <div className="bg-[#111622] border border-white/10 rounded-2xl p-4 shadow-xl flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <AppWindow className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Native Floating Overlay Window (Always-On-Top)</span>
              {nativeHudRunning ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Running (PID {nativeHudPid})
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-gray-400">
                  Closed
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400">
              Opens a translucent borderless 100% Go window floating directly over ACC/LMU/AC. Draggable with mouse and closes on Esc.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {nativeHudRunning ? (
            <button
              onClick={handleCloseNative}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Close Floating Overlay</span>
            </button>
          ) : (
            <button
              onClick={handleLaunchNative}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-500 shadow-md shadow-purple-600/20 transition cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Floating Overlay</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
