import { spawn } from 'node:child_process';
import type { CitedAnswer, LlmClient, LlmMessage } from '../ports/llm.js';
import { parseAnswerInput } from './claude-llm.js';

/** Executa o processo e devolve stdout; injetável para testes. */
export type CliRunner = (args: string[], stdin: string) => Promise<string>;

export interface ClaudeCliOptions {
  /** Executável do Claude Code (padrão: "claude"). */
  bin?: string;
  model?: string;
  timeoutMs?: number;
  runner?: CliRunner;
}

/** Runner real: chama `claude -p` lendo o prompt da entrada padrão. */
export function spawnRunner(bin: string, model: string | undefined, timeoutMs: number): CliRunner {
  return (_args, stdin) =>
    new Promise((resolve, reject) => {
      const args = ['-p', '--output-format', 'json', ...(model ? ['--model', model] : [])];
      const child = spawn(bin, args, { shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`claude CLI excedeu ${timeoutMs} ms`));
      }, timeoutMs);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new Error(`Falha ao executar ${bin}: ${e.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(`claude CLI saiu com código ${code}: ${err.trim()}`));
        else resolve(out);
      });
      child.stdin.end(stdin);
    });
}

/** Extrai o objeto JSON da resposta textual (tolera cercas de código e texto ao redor). */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Resposta do claude CLI sem JSON');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * LlmClient sobre o Claude Code instalado localmente (usa a sua autenticação do CLI, sem ANTHROPIC_API_KEY).
 * Sem tool use nem streaming: o JSON de citações é pedido no prompt e validado com o mesmo schema do adapter da API.
 * Uso apenas para avaliação local; o caminho de produção continua sendo ClaudeLlm.
 */
export class ClaudeCliLlm implements LlmClient {
  private readonly runner: CliRunner;

  constructor(opts: ClaudeCliOptions = {}) {
    this.runner = opts.runner ?? spawnRunner(opts.bin ?? 'claude', opts.model, opts.timeoutMs ?? 120_000);
  }

  async answer({ system, messages, onDelta }: { system: string; messages: LlmMessage[]; onDelta?: (t: string) => void }): Promise<CitedAnswer> {
    const prompt = [
      system,
      '',
      'Responda APENAS com um objeto JSON no formato:',
      '{"resposta": string, "encontrado": boolean, "citacoes": [{"chunkId": string, "trecho": string}]}',
      'Sem texto fora do JSON.',
      '',
      ...messages.map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`),
    ].join('\n');

    const raw = await this.runner([], prompt);
    const envelope = JSON.parse(raw) as { is_error?: boolean; result?: string };
    if (envelope.is_error || typeof envelope.result !== 'string') throw new Error('claude CLI retornou erro');
    const answer = parseAnswerInput(extractJsonObject(envelope.result));
    onDelta?.(answer.resposta);
    return answer;
  }
}
