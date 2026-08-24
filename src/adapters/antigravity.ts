import { spawn } from 'node:child_process';
import type { TaskCapsule } from '../domain/types.js';
import type { WorkerAdapter, WorkerEvent, WorkerRunResult } from './worker.js';

export interface AntigravityOptions {
  command?: string;
  cwd: string;
  extraArgs?: string[];
}

export class AntigravityWorkerAdapter implements WorkerAdapter {
  readonly name = 'antigravity';

  constructor(private readonly options: AntigravityOptions) {}

  async run(
    capsule: TaskCapsule,
    options?: { sessionId?: string; signal?: AbortSignal },
  ): Promise<WorkerRunResult> {
    const command = this.options.command ?? 'agy';
    const prompt = this.buildPrompt(capsule);
    const args = ['-p', prompt, '--output-format', 'stream-json', ...(this.options.extraArgs ?? [])];

    if (options?.sessionId) {
      args.push('--conversation', options.sessionId);
    }

    const events: WorkerEvent[] = [];

    return await new Promise<WorkerRunResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.options.cwd,
        shell: false,
        windowsHide: true,
        signal: options?.signal,
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let sessionId = options?.sessionId;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      child.stdout.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const raw = JSON.parse(line) as Record<string, unknown>;
            if (typeof raw.conversation_id === 'string') sessionId = raw.conversation_id;
            events.push({ type: 'progress', message: line, raw });
          } catch {
            events.push({ type: 'progress', message: line });
          }
        }
      });

      child.stderr.on('data', (chunk: string) => {
        stderrBuffer += chunk;
      });

      child.once('error', reject);
      child.once('close', (code) => {
        if (stdoutBuffer.trim()) events.push({ type: 'progress', message: stdoutBuffer.trim() });

        if (code !== 0) {
          const message = stderrBuffer.trim() || `Antigravity exited with code ${code ?? 'unknown'}`;
          events.push({ type: 'error', message });
          reject(new Error(message));
          return;
        }

        resolve({
          sessionId,
          summary: events.at(-1)?.message ?? 'Antigravity task completed.',
          events,
        });
      });
    });
  }

  private buildPrompt(capsule: TaskCapsule): string {
    return [
      `TASK ${capsule.task.id}: ${capsule.task.title}`,
      `Objective: ${capsule.task.objective}`,
      `Acceptance criteria:\n- ${capsule.task.acceptanceCriteria.join('\n- ')}`,
      `Relevant rules:\n- ${capsule.relevantRules.join('\n- ')}`,
      `Relevant invariants:\n- ${capsule.relevantInvariants.join('\n- ')}`,
      `Constraints:\n- ${capsule.constraints.join('\n- ')}`,
      'Do not expand scope. Report changed files, verification performed, remaining risks, and uncertainty.',
    ].join('\n\n');
  }
}
