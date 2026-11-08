import type { ComposeOptions } from '../../lib/compose';

export type OutputFormat = 'png' | 'jpeg';

export interface ConnectorSettings extends ComposeOptions {
  format: OutputFormat;
  quality: number;
}

export const DEFAULT_SETTINGS: ConnectorSettings = {
  mode: 'row',
  perRow: 4,
  matchHeights: true,
  gap: 80,
  padding: 32,
  arrowColor: '#18181b',
  arrowThickness: 5,
  arrowHeadSize: 22,
  background: '#ffffff',
  format: 'png',
  quality: 0.92,
};
