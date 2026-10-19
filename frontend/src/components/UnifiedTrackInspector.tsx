import React, { useMemo, useState } from 'react';
import type { ComparisonResponse, CornerDTO } from '../types/telemetry';
import { buildActionPlan, computePhaseMetrics } from '../utils/cornerPhases';
import { useLanguage } from '../i18n';
import { CornerDiagram } from './inspector/CornerDiagram';
import { CornerHeader } from './inspector/CornerHeader';
import { CornerPhasePanel } from './inspector/CornerPhasePanel';
import { CornerSelectorBar } from './inspector/CornerSelectorBar';
import { LapSummaryCards } from './inspector/LapSummaryCards';
import { TrackOverview } from './inspector/TrackOverview';
import { buildTrackGeometry, type CornerViewMode } from './inspector/trackGeometry';

interface UnifiedTrackInspectorProps {
  comparison: ComparisonResponse;
  selectedCorner: CornerDTO | null;
  onSelectCorner: (corner: CornerDTO | null) => void;
  hoverDistance: number | null;
  onHoverDistance?: (dist: number | null) => void;
  onAskEngineerAboutCorner?: (corner: CornerDTO) => void;
}

export const UnifiedTrackInspector: React.FC<UnifiedTrackInspectorProps> = ({
  comparison,
  selectedCorner,
  onSelectCorner,
  hoverDistance,
  onHoverDistance,
  onAskEngineerAboutCorner,
}) => {
  const { lang } = useLanguage();
  const [cornerViewMode, setCornerViewMode] = useState<CornerViewMode>('phase');
  const corners = comparison.corners;

  const handleOpenCornerDirectly = (corner: CornerDTO) => {
    setCornerViewMode('track2d');
    onSelectCorner(corner);
  };

  const staticTrack = useMemo(() => buildTrackGeometry(comparison), [comparison]);

  // Identify corner with worst time loss for overview card
  const worstCorner = useMemo(() => {
    if (corners.length === 0) return null;
    return corners.reduce((worst, c) => (c.delta_time > (worst?.delta_time || -999) ? c : worst), corners[0]);
  }, [corners]);

  // Overall lap delta
  const totalGap = comparison.delta_time && comparison.delta_time.length > 0
    ? comparison.delta_time[comparison.delta_time.length - 1]
    : 0;

  const phaseMetrics = useMemo(
    () => (selectedCorner ? computePhaseMetrics(selectedCorner, comparison) : null),
    [selectedCorner, comparison]
  );
  const actionPlan = useMemo(() => (phaseMetrics ? buildActionPlan(phaseMetrics, lang) : null), [phaseMetrics, lang]);

  return (
    <div className="glass-panel rounded-xl p-3 flex flex-col h-full gap-2 overflow-hidden">
      <CornerSelectorBar corners={corners} selectedCorner={selectedCorner} onSelectCorner={onSelectCorner} />

      <CornerHeader
        comparison={comparison}
        corners={corners}
        selectedCorner={selectedCorner}
        cornerViewMode={cornerViewMode}
        setCornerViewMode={setCornerViewMode}
        totalGap={totalGap}
        onAskEngineerAboutCorner={onAskEngineerAboutCorner}
      />

      {/* Main viewer: phase table, corner diagram or the whole-track map */}
      <div className="relative flex-1 min-h-0 bg-night-1 rounded-xl border border-white/5 overflow-hidden flex items-center justify-center">
        {selectedCorner && cornerViewMode === 'phase' ? (
          <CornerPhasePanel
            selectedCorner={selectedCorner}
            phaseMetrics={phaseMetrics}
            actionPlan={actionPlan}
            setCornerViewMode={setCornerViewMode}
            onAskEngineerAboutCorner={onAskEngineerAboutCorner}
          />
        ) : selectedCorner && selectedCorner.racing_line_svg ? (
          <CornerDiagram selectedCorner={selectedCorner} staticTrack={staticTrack} onSelectCorner={onSelectCorner} />
        ) : staticTrack ? (
          <TrackOverview
            comparison={comparison}
            staticTrack={staticTrack}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            handleOpenCornerDirectly={handleOpenCornerDirectly}
          />
        ) : (
          <div className="text-gray-500 text-xs font-telemetry">...</div>
        )}
      </div>

      {selectedCorner === null && (
        <LapSummaryCards worstCorner={worstCorner} totalGap={totalGap} onSelectCorner={onSelectCorner} />
      )}
    </div>
  );
};
