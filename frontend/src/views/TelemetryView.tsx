import React from 'react';
import { CornerSelector } from '../components/CornerSelector';
import { TelemetryCharts } from '../components/TelemetryCharts';
import { TimingTower } from '../components/TimingTower';
import { TrackMap } from '../components/TrackMap';
import type { ComparisonResponse, CornerDTO } from '../types/telemetry';

interface TelemetryViewProps {
  comparison: ComparisonResponse;
  hoverDistance: number | null;
  onHoverDistance: (d: number | null) => void;
  selectedCorner: CornerDTO | null;
  onSelectCorner: (c: CornerDTO | null) => void;
}

export const TelemetryView: React.FC<TelemetryViewProps> = ({
  comparison,
  hoverDistance,
  onHoverDistance,
  selectedCorner,
  onSelectCorner,
}) => {
  return (
    <div className="space-y-4">
      {/* 1. Timing Tower */}
      <TimingTower comparison={comparison} />

      {/* 2. Dual Workspace: 2D Closed Track Map & 4-Row Telemetry Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: 2D Track Map (5 cols) */}
        <div className="lg:col-span-5 h-[490px]">
          <TrackMap
            comparison={comparison}
            hoverDistance={hoverDistance}
            selectedCorner={selectedCorner}
            onSelectCorner={onSelectCorner}
          />
        </div>

        {/* Right Column: 4-Channel Synchronized Telemetry (7 cols) */}
        <div className="lg:col-span-7 h-[490px]">
          <TelemetryCharts
            comparison={comparison}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            selectedCorner={selectedCorner}
            onResetZoom={() => onSelectCorner(null)}
          />
        </div>
      </div>

      {/* 3. Corner-by-Corner Segment HUD Cards */}
      <CornerSelector
        corners={comparison.corners}
        selectedCorner={selectedCorner}
        onSelectCorner={onSelectCorner}
      />
    </div>
  );
};
