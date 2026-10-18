import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  FolderOpen,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { autodiscoverSims, generateDemoSession, uploadTelemetryFile } from '../services/api';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionLoaded: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onSessionLoaded }) => {
  const [tab, setTab] = useState<'acc' | 'lmu' | 'upload' | 'demo'>('acc');
  const [autoData, setAutoData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (isOpen) {
      loadAutodiscover();
    }
  }, [isOpen]);

  const loadAutodiscover = async () => {
    try {
      const data = await autodiscoverSims();
      setAutoData(data);
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setStatusMsg(null);
      await uploadTelemetryFile(file);
      setStatusMsg({ type: 'success', text: `Archivo ${file.name} importado correctamente.` });
      onSessionLoaded();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error al importar archivo' });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDemo = async () => {
    try {
      setLoading(true);
      setStatusMsg(null);
      await generateDemoSession();
      setStatusMsg({
        type: 'success',
        text: 'Sesión de competición (Porsche 992 GT3 R en Valencia) cargada con éxito.',
      });
      onSessionLoaded();
      setTimeout(onClose, 800);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error cargando sesión demo' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0D111A] border border-[#2A364F] rounded-2xl w-full max-w-2xl flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#111723]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#E10600]/20 border border-[#E10600]/40 flex items-center justify-center text-[#E10600]">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Importador Universal de Telemetría</h2>
              <p className="text-xs text-gray-400">
                Soporte nativo para Assetto Corsa Competizione, Le Mans Ultimate e iRacing
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-[#0A0D14] px-6 text-xs font-semibold">
          <button
            onClick={() => setTab('acc')}
            className={`py-3 px-4 border-b-2 cursor-pointer transition ${
              tab === 'acc'
                ? 'border-[#00D2BE] text-[#00D2BE]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            ACC (MoTeC .ld)
          </button>
          <button
            onClick={() => setTab('lmu')}
            className={`py-3 px-4 border-b-2 cursor-pointer transition ${
              tab === 'lmu'
                ? 'border-[#00D2BE] text-[#00D2BE]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Le Mans Ultimate (XML)
          </button>
          <button
            onClick={() => setTab('upload')}
            className={`py-3 px-4 border-b-2 cursor-pointer transition ${
              tab === 'upload'
                ? 'border-[#00D2BE] text-[#00D2BE]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Subir Archivo
          </button>
          <button
            onClick={() => setTab('demo')}
            className={`py-3 px-4 border-b-2 cursor-pointer transition ${
              tab === 'demo'
                ? 'border-[#B138FE] text-[#B138FE]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Demo de Competición
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 space-y-4">
          {statusMsg && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
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

          {/* TAB 1: ACC */}
          {tab === 'acc' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#0F131C] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#00D2BE] uppercase tracking-wider">
                  <FolderOpen className="w-4 h-4" />
                  <span>Ruta de Telemetría Steam Linux:</span>
                </div>
                <code className="text-[11px] text-gray-300 block bg-black/40 p-2 rounded border border-white/5 break-all font-telemetry">
                  {autoData?.acc_path || 'Buscando directorio MoTeC en Steam Proton...'}
                </code>
                <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                  <span>Archivos .ld detectados:</span>
                  <span className="font-bold text-white font-telemetry">{autoData?.acc_found ?? 0}</span>
                </div>
              </div>

              {autoData?.acc_files && autoData.acc_files.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs text-gray-400 font-semibold block">Archivos recientes:</span>
                  <div className="max-h-40 overflow-y-auto space-y-1 font-telemetry text-xs">
                    {autoData.acc_files.map((f: string) => (
                      <div
                        key={f}
                        className="p-2 rounded bg-[#151B27] border border-white/5 flex items-center justify-between text-gray-200"
                      >
                        <span className="truncate">{f}</span>
                        <span className="text-[10px] text-gray-500">.ld</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  Para registrar vueltas en ACC, activa en el setup del coche la opción{' '}
                  <strong className="text-gray-200">Telemetry Laps &gt; 0</strong>. El juego escribirá los
                  archivos automáticamente.
                </p>
              )}
            </div>
          )}

          {/* TAB 2: LMU */}
          {tab === 'lmu' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#0F131C] border border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#00D2BE] uppercase tracking-wider">
                  <FolderOpen className="w-4 h-4" />
                  <span>Ruta de Registros Le Mans Ultimate:</span>
                </div>
                <code className="text-[11px] text-gray-300 block bg-black/40 p-2 rounded border border-white/5 break-all font-telemetry">
                  {autoData?.lmu_path || 'Buscando directorio Results en Steam...'}
                </code>
                <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                  <span>Archivos XML de sesión detectados:</span>
                  <span className="font-bold text-white font-telemetry">{autoData?.lmu_found ?? 0}</span>
                </div>
              </div>

              {autoData?.lmu_files && autoData.lmu_files.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs text-gray-400 font-semibold block">Sesiones recientes:</span>
                  <div className="max-h-40 overflow-y-auto space-y-1 font-telemetry text-xs">
                    {autoData.lmu_files.map((f: string) => (
                      <div
                        key={f}
                        className="p-2 rounded bg-[#151B27] border border-white/5 flex items-center justify-between text-gray-200"
                      >
                        <span className="truncate">{f}</span>
                        <span className="text-[10px] text-gray-500">.xml</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  LMU guarda los resultados de cada sesión en formato XML en su carpeta de usuario.
                </p>
              )}
            </div>
          )}

          {/* TAB 3: UPLOAD */}
          {tab === 'upload' && (
            <div className="border-2 border-dashed border-[#2D3A52] hover:border-[#00D2BE] rounded-xl p-8 text-center transition cursor-pointer relative bg-[#090C13]">
              <input
                type="file"
                accept=".ld,.xml,.csv"
                onChange={handleFileUpload}
                disabled={loading}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="flex flex-col items-center justify-center space-y-2">
                <Upload className="w-10 h-10 text-[#00D2BE]" />
                <span className="text-sm font-bold text-white">
                  Arrastra o selecciona un archivo de telemetría
                </span>
                <span className="text-xs text-gray-400 font-telemetry">
                  Formatos compatibles: MoTeC (.ld), Le Mans Ultimate (.xml), CSV Universal (.csv)
                </span>
              </div>
            </div>
          )}

          {/* TAB 4: DEMO */}
          {tab === 'demo' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#B138FE]/10 border border-[#B138FE]/30 flex items-center justify-center text-[#B138FE] mx-auto">
                <Sparkles className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Sesión Demo: Porsche 992 GT3 R en Valencia</h4>
                <p className="text-xs text-gray-400 max-w-md mx-auto mt-1">
                  Genera una sesión completa con telemetría de competición calibrada a 50 Hz en los 4.005
                  metros del Circuit Ricardo Tormo con análisis de las 14 curvas.
                </p>
              </div>
              <button
                onClick={handleLoadDemo}
                disabled={loading}
                className="px-6 py-2.5 rounded-lg bg-[#00D2BE] hover:bg-[#00E5CF] text-black text-xs font-bold uppercase tracking-wider transition shadow-[0_0_20px_rgba(0,210,190,0.3)] cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Generando Telemetría...' : 'Cargar Sesión Demo'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#111723] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
