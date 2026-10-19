import React, { useEffect, useState } from 'react';
import {
  CheckCircle,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Save,
  Server,
} from 'lucide-react';
import { fetchSettings, saveSettings } from '../services/api';
import type { SystemStatus } from '../types/telemetry';
import { useLanguage } from '../i18n';

interface SettingsViewProps {
  status: SystemStatus | null;
  onSettingsSaved: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ status, onSettingsSaved }) => {
  const { t } = useLanguage();
  const [provider, setProvider] = useState<'ollama' | 'openai'>('ollama');
  const [ollamaModel, setOllamaModel] = useState('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434');

  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('https://api.openai.com/v1');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');

  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const loadCurrentSettings = async () => {
    try {
      const cfg = await fetchSettings();
      setProvider(cfg.provider === 'openai' ? 'openai' : 'ollama');
      setOllamaModel(cfg.ollama_model);
      setOllamaBaseUrl(cfg.ollama_base_url || 'http://localhost:11434');
      setOpenaiApiKey(cfg.openai_api_key || '');
      setOpenaiBaseUrl(cfg.openai_base_url || 'https://api.openai.com/v1');
      setOpenaiModel(cfg.openai_model || 'gpt-4o-mini');
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadCurrentSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSavedSuccess(false);
      await saveSettings({
        provider,
        ollama_model: ollamaModel,
        ollama_base_url: ollamaBaseUrl,
        openai_api_key: openaiApiKey,
        openai_base_url: openaiBaseUrl,
        openai_model: openaiModel,
      });
      setSavedSuccess(true);
      onSettingsSaved();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Cpu className="w-5 h-5 text-brand" />
          {t('ai_engine_title')}
        </h3>
        <p className="text-xs text-gray-400">
          {t('ai_engine_subtitle')}
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{t('settings_saved_alert')}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Provider Selector Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Option 1: Local Ollama */}
          <div
            onClick={() => setProvider('ollama')}
            className={`p-5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
              provider === 'ollama'
                ? 'bg-[#151D2C] border-brand shadow-[0_0_20px_rgba(0,210,190,0.15)] ring-1 ring-brand'
                : 'bg-night-6 hover:bg-[#121722] border-white/5'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-white flex items-center gap-2">
                  <Server className="w-4 h-4 text-brand" />
                  {t('ollama_local_title')}
                </span>
                {provider === 'ollama' && <span className="text-[10px] text-brand font-bold">{t('ollama_active_badge')}</span>}
              </div>
              <p className="text-xs text-gray-400">
                {t('ollama_desc')}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-telemetry text-gray-400">
              {t('ollama_recommended')}: <strong className="text-white">qwen3.8:27b</strong>
            </div>
          </div>

          {/* Option 2: OpenAI Compatible */}
          <div
            onClick={() => setProvider('openai')}
            className={`p-5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
              provider === 'openai'
                ? 'bg-[#1D172E] border-comp shadow-[0_0_20px_rgba(177,56,254,0.15)] ring-1 ring-comp'
                : 'bg-night-6 hover:bg-[#121722] border-white/5'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-comp" />
                  {t('openai_compatible_title')}
                </span>
                {provider === 'openai' && <span className="text-[10px] text-comp font-bold">{t('ollama_active_badge')}</span>}
              </div>
              <p className="text-xs text-gray-400">
                {t('openai_desc')}
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-telemetry text-gray-400">
              {t('compatible_endpoints')}: <strong className="text-white">OpenRouter, OpenAI, vLLM</strong>
            </div>
          </div>
        </div>

        {/* Detailed Provider Settings */}
        {provider === 'ollama' && (
          <div className="glass-panel rounded-xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              {t('ollama_params_title')}
            </h4>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t('ollama_model_label')}</label>
              {status?.ollama_models && status.ollama_models.length > 0 ? (
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full bg-night-8 border border-white/10 rounded-lg p-2.5 text-xs text-white font-telemetry focus:outline-none focus:border-brand"
                >
                  {status.ollama_models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="qwen3.8:27b"
                  className="w-full bg-night-8 border border-white/10 rounded-lg p-2.5 text-xs text-white font-telemetry focus:outline-none focus:border-brand"
                />
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t('ollama_base_url_label')}</label>
              <input
                type="text"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-night-8 border border-white/10 rounded-lg p-2.5 text-xs text-white font-telemetry focus:outline-none focus:border-brand"
              />
            </div>
          </div>
        )}

        {provider === 'openai' && (
          <div className="glass-panel rounded-xl p-5 space-y-4">
            <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              {t('openai_params_title')}
            </h4>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t('api_key_label')}</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-or-v1-... o sk-..."
                  className="w-full bg-night-8 border border-white/10 rounded-lg p-2.5 pr-10 text-xs text-white font-telemetry focus:outline-none focus:border-comp"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t('base_url_label')}</label>
              <input
                type="text"
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1 o https://api.openai.com/v1"
                className="w-full bg-night-8 border border-white/10 rounded-lg p-2.5 text-xs text-white font-telemetry focus:outline-none focus:border-comp"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t('model_name_label')}</label>
              <input
                type="text"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                placeholder="gpt-4o, deepseek/deepseek-chat, anthropic/claude-3.5-sonnet"
                className="w-full bg-night-8 border border-white/10 rounded-lg p-2.5 text-xs text-white font-telemetry focus:outline-none focus:border-comp"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-brand hover:bg-brand-light text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-md disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? t('saving_btn') : t('save_config_btn')}</span>
        </button>
      </form>
    </div>
  );
};
