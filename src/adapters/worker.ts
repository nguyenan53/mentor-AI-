import type { TaskCapsule } from '../domain/types.js';

export interface WorkerEvent {
  type: 'started' | 'progress' | 'tool' | 'result' | 'error';
  message: string;
  raw?: unknown;
}

export interface WorkerRunResult {
  sessionId?: string;
  summary: string;
  events: WorkerEvent[];
}

export interface WorkerAdapter {
  readonly name: string;
  run(capsule: TaskCapsule, options?: { sessionId?: string; signal?: AbortSignal }): Promise<WorkerRunResult>;
}
