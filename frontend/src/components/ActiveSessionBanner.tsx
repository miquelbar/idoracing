import React from 'react';
import { TelemetryHeaderBar } from './TelemetryHeaderBar';
import type { ComparisonResponse } from '../types/telemetry';

export interface ActiveSessionBannerProps {
  trackName: string;
  carName: string;
  gameName?: string;
  lapCount?: number;
  bestLapTime?: number;
  refLapNumber?: number;
  compLapNumber?: number;
  comparison?: ComparisonResponse | null;
  onNavigateToSessions: () => void;
  onOpenDebrief?: () => void;
  reportAvailable?: boolean;
}

export const ActiveSessionBanner: React.FC<ActiveSessionBannerProps> = ({
  trackName,
  carName,
  gameName = 'Assetto Corsa Competizione',
  lapCount,
  bestLapTime,
  refLapNumber = 1,
  compLapNumber = 2,
  comparison,
  onNavigateToSessions,
  onOpenDebrief,
  reportAvailable = false,
}) => {
  return (
    <TelemetryHeaderBar
      trackName={trackName}
      carName={carName}
      gameName={gameName}
      lapCount={lapCount}
      bestLapTime={bestLapTime}
      refLapNumber={refLapNumber}
      compLapNumber={compLapNumber}
      comparison={comparison}
      onNavigateToSessions={onNavigateToSessions}
      onOpenDebrief={onOpenDebrief}
      reportAvailable={reportAvailable}
    />
  );
};
