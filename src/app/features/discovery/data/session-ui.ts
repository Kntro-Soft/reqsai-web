import { BadgeVariant } from '../../../shared/ui';
import { SessionEventType, SessionStatus } from './discovery.models';

/** Badge color for each session lifecycle status. */
export function statusVariant(status: SessionStatus): BadgeVariant {
  const map: Record<SessionStatus, BadgeVariant> = {
    DRAFT: 'secondary',
    RECORDING: 'success',
    PAUSED: 'warning',
    STOPPED: 'secondary',
    PROCESSING: 'default',
    COMPLETED: 'success',
    FAILED: 'destructive',
  };
  return map[status];
}

/** Human-readable Spanish label for each session status. */
export function statusLabel(status: SessionStatus): string {
  const map: Record<SessionStatus, string> = {
    DRAFT: 'Borrador',
    RECORDING: 'Grabando',
    PAUSED: 'Pausada',
    STOPPED: 'Detenida',
    PROCESSING: 'Procesando',
    COMPLETED: 'Completada',
    FAILED: 'Fallida',
  };
  return map[status];
}

/** Human-readable Spanish label for each realtime event type. */
export const EVENT_LABEL: Record<SessionEventType, string> = {
  RECORDING_STARTED: 'Grabación iniciada',
  RECORDING_PAUSED: 'Grabación pausada',
  RECORDING_RESUMED: 'Grabación reanudada',
  RECORDING_STOPPED: 'Grabación detenida',
  SESSION_RESET: 'Sesión reiniciada',
  TRANSCRIPT_SEGMENT: 'Segmento de transcripción',
  TRANSCRIPT_UPLOADED: 'Transcripción cargada',
  PROCESSING: 'Procesando con IA',
  COMPLETED: 'Procesamiento completado',
  FAILED: 'Procesamiento fallido',
  STORY_GENERATED: 'Historia generada',
  SUGGESTION_GENERATED: 'Sugerencia generada',
  SUGGESTION_ACCEPTED: 'Sugerencia aceptada',
  SUGGESTION_DISMISSED: 'Sugerencia descartada',
};
