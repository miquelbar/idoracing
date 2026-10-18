import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  FolderOpen,
  HelpCircle,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { importLocalFile, uploadTelemetryFile } from '../services/api';
import type { AutoDiscoverData } from '../types/telemetry';

interface FilesViewProps {
  autoData: AutoDiscoverData | null;
  onRefreshAutoData: () => void;
  onSessionImported: () => void;
  onLoadDemo: () => void;
  loading: boolean;
  activeTrackName?: string;
  activeCarName?: string;
  activeGameName?: string;
  onOpenSwitcher?: () => void;
}

export const FilesView: React.FC<FilesViewProps> = ({
  autoData,
  onRefreshAutoData,
  onSessionImported,
  onLoadDemo,
  loading,
  activeTrackName = 'Ricardo Tormo de Valencia',
  activeCarName = 'Porsche 911 GT3 R (992)',
  activeGameName = 'Assetto Corsa Competizione',
  onOpenSwitcher,
}) => {
  const [importingPath, setImportingPath] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const handleImportLocal = async (filepath: string) => {
    try {
      setImportingPath(filepath);
      setStatusMsg(null);
      const res = await importLocalFile(filepath);
      setStatusMsg({
        type: 'success',
        text: `Pista cargada con éxito: ${res.track} (${res.laps} vueltas registradas). Se ha establecido como la sesión activa en el workspace.`,
      });
      onSessionImported();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error importando archivo' });
    } finally {
      setImportingPath(null);
    }
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setStatusMsg(null);
      const res = await uploadTelemetryFile(file);
      setStatusMsg({
        type: 'success',
        text: `Archivo '${file.name}' subido e importado. Pista activa: ${res.track || 'Sesión importada'}.`,
      });
      onSessionImported();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error al procesar el archivo subido' });
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Active Loaded Session Card */}
      <div className="glass-panel rounded-xl p-5 border-l-4 border-l-[#00D2BE] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#00D2BE]/20 text-[#00D2BE] border border-[#00D2BE]/40 uppercase font-telemetry">
              Simulador y Pista Activa en Workspace
            </span>
            <span className="text-xs text-gray-400 font-telemetry">• {activeGameName}</span>
          </div>
          <h3 className="text-xl font-black text-white font-f1-brand tracking-wide uppercase">
            {activeTrackName}
          </h3>
          <p className="text-xs text-gray-400 font-telemetry">
            Vehículo activo: <strong className="text-white">{activeCarName}</strong> • En SimCoach se trabaja con 1 juego y 1 circuito a la vez para mantener el análisis 100% focalizado.
          </p>
        </div>

        {onOpenSwitcher && (
          <button
            onClick={onOpenSwitcher}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#18202F] hover:bg-[#222E42] text-white border border-[#2D3A52] text-xs font-bold transition cursor-pointer self-start sm:self-auto shrink-0 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#00D2BE]" />
            <span>Cambiar Pista / Juego</span>
          </button>
        )}
      </div>

      {/* 2. Top Header & Rescan */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-[#00D2BE]" />
            Detección Automática de Archivos y Simuladores
          </h3>
          <p className="text-xs text-gray-400">
            Escaneo en tiempo real de directorios de Assetto Corsa Competizione y Le Mans Ultimate en tu equipo
          </p>
        </div>

        <button
          onClick={onRefreshAutoData}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#141A26] hover:bg-[#1C2436] border border-white/10 text-xs text-gray-300 transition cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#00D2BE] ${loading ? 'animate-spin' : ''}`} />
          <span>Volver a escanear</span>
        </button>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/50 border border-emerald-700 text-emerald-200'
              : 'bg-red-950/50 border border-red-800 text-red-200'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* 3. Grid of Simulators */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Le Mans Ultimate */}
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-f1-brand">
                Le Mans Ultimate (LMU)
              </h4>
            </div>
            <span className="text-xs font-telemetry text-gray-400">
              {autoData?.lmu_found ?? 0} sesiones detectadas
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Directorio Steam:</span>
            <code className="text-[11px] text-gray-300 block bg-black/40 p-2 rounded border border-white/5 font-telemetry break-all">
              {autoData?.lmu_path || 'Buscando en ~/.local/share/Steam/...'}
            </code>
          </div>

          <div className="space-y-2 pt-2">
            <span className="text-xs text-gray-300 font-semibold block">Archivos de Sesión XML (Resultados):</span>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 font-telemetry text-xs">
              {(autoData?.lmu_files || []).map((file) => (
                <div
                  key={file.path}
                  className="p-2.5 rounded-lg bg-[#0E121B] border border-white/5 hover:border-white/15 flex items-center justify-between gap-3"
                >
                  <span className="truncate text-gray-300" title={file.filename}>
                    {file.filename}
                  </span>
                  <button
                    onClick={() => handleImportLocal(file.path)}
                    disabled={importingPath === file.path}
                    className="px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white border border-blue-500/40 text-[10px] font-bold uppercase transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {importingPath === file.path ? 'Cargando...' : 'Cargar en Workspace'}
                  </button>
                </div>
              ))}

              {(!autoData?.lmu_files || autoData.lmu_files.length === 0) && (
                <p className="text-xs text-gray-500 py-4 text-center">
                  No se encontraron archivos XML en la carpeta Results de LMU.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Assetto Corsa Competizione */}
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E10600]" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-f1-brand">
                Assetto Corsa Competizione (ACC)
              </h4>
            </div>
            <span className="text-xs font-telemetry text-gray-400">
              {autoData?.acc_found ?? 0} archivos .ld detectados
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Directorio MoTeC Proton:</span>
            <code className="text-[11px] text-gray-300 block bg-black/40 p-2 rounded border border-white/5 font-telemetry break-all">
              {autoData?.acc_path || 'Buscando en Proton compatdata/805550/...'}
            </code>
          </div>

          <div className="space-y-2 pt-2">
            <span className="text-xs text-gray-300 font-semibold block">Archivos MoTeC (.ld):</span>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 font-telemetry text-xs">
              {(autoData?.acc_files || []).map((file) => (
                <div
                  key={file.path}
                  className="p-2.5 rounded-lg bg-[#0E121B] border border-white/5 hover:border-white/15 flex items-center justify-between gap-3"
                >
                  <span className="truncate text-gray-300" title={file.filename}>
                    {file.filename}
                  </span>
                  <button
                    onClick={() => handleImportLocal(file.path)}
                    disabled={importingPath === file.path}
                    className="px-2.5 py-1 rounded bg-[#E10600]/20 hover:bg-[#E10600]/30 text-[#FF453A] border border-[#E10600]/40 text-[10px] font-bold uppercase transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {importingPath === file.path ? 'Cargando...' : 'Cargar en Workspace'}
                  </button>
                </div>
              ))}

              {(!autoData?.acc_files || autoData.acc_files.length === 0) && (
                <div className="p-3.5 rounded-lg bg-[#080B11] border border-white/5 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-[#FFD700] font-bold">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>¿Cómo activar la telemetría MoTeC en ACC?</span>
                  </div>
                  <p className="text-gray-300 text-[11px] leading-relaxed">
                    Por defecto, ACC no escribe telemetría a disco para no ocupar espacio. Para activarla:
                  </p>
                  <ol className="text-gray-400 text-[11px] space-y-1 list-decimal list-inside">
                    <li>Entra en pista o garaje en ACC y pulsa en <strong>Setup</strong>.</li>
                    <li>Ve a la pestaña <strong>Electrónica</strong> (Electronics).</li>
                    <li>Abajo a la derecha, cambia <strong className="text-white">Telemetry Laps</strong> de <code className="text-red-400">0</code> a <code className="text-[#00D2BE]">10</code> o <code className="text-[#00D2BE]">99</code>.</li>
                    <li>Completa vueltas en pista; ACC generará los archivos <code className="text-white">.ld</code> y <code className="text-white">.ldx</code> automáticamente.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Manual Upload & Demo Box */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Manual Drag & Drop */}
        <div className="border-2 border-dashed border-[#283248] hover:border-[#00D2BE] rounded-xl p-8 text-center transition cursor-pointer relative bg-[#090C13]">
          <input
            type="file"
            accept=".ld,.xml,.csv"
            onChange={handleManualUpload}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <div className="flex flex-col items-center justify-center space-y-2">
            <Upload className="w-8 h-8 text-[#00D2BE]" />
            <h4 className="text-sm font-bold text-white">Subir Archivo Manual (.ld, .xml, .csv)</h4>
            <p className="text-xs text-gray-400">
              Arrastra aquí o pulsa para buscar un archivo de iRacing, MoTeC o Le Mans Ultimate
            </p>
          </div>
        </div>

        {/* Demo Session Loader */}
        <div className="glass-panel rounded-xl p-6 flex flex-col justify-between items-center text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#B138FE]/20 border border-[#B138FE]/40 flex items-center justify-center text-[#B138FE]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Sesión Demo: Valencia (Porsche 992 GT3 R)</h4>
            <p className="text-xs text-gray-400 max-w-sm mt-0.5">
              Genera una sesión de competición en el Circuit Ricardo Tormo con análisis de las 14 curvas.
            </p>
          </div>
          <button
            onClick={onLoadDemo}
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md disabled:opacity-50"
          >
            {loading ? 'Cargando Demo...' : 'Cargar Sesión Demo'}
          </button>
        </div>
      </div>
    </div>
  );
};
