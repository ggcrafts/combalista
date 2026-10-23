// ============================================================
//  LLM — uma porta só para "perguntar ao Claude"
//    API da Anthropic (se houver ANTHROPIC_API_KEY) ou Claude Code (plano do Claude)
// ============================================================
import Anthropic from '@anthropic-ai/sdk';
import {config} from './config';
import {askClaude, findClaudeCli} from './claude-cli';

export type Turn = {role: 'user' | 'assistant'; content: string};

export function llmEngine(): 'api' | 'claude-code' | null {
  if (config.anthropicKey) return 'api';
  return findClaudeCli() ? 'claude-code' : null;
}

export const llmLabel = () =>
  ({api: 'API da Anthropic', 'claude-code': 'Claude Code (seu plano)'} as const)[llmEngine() ?? 'api'];

/** Conversa curta → texto da resposta. O Claude Code não guarda conversa, então os turnos viram um prompt só. */
export async function askLLM(turns: Turn[], system: string, maxTokens = 3000): Promise<string> {
  const engine = llmEngine();
  if (!engine) throw new Error('Sem ANTHROPIC_API_KEY e sem Claude Code instalado: não há quem escreva.');
  if (engine === 'api') {
    const res = await new Anthropic({apiKey: config.anthropicKey}).messages.create({
      model: config.claudeModel,
      max_tokens: maxTokens,
      system,
      messages: turns,
    });
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  }
  const transcript = turns.map((t) => (t.role === 'assistant' ? `Sua resposta anterior:\n${t.content}` : t.content)).join('\n\n');
  return askClaude(`${transcript}\n\nResponda APENAS com o JSON.`, system, config.claudeCodeModel);
}

/** Pega o primeiro objeto/array JSON de uma resposta (ignora texto em volta e cercas de código) */
export function extractJson(text: string): unknown {
  const starts = [text.indexOf('{'), text.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) throw new Error('Resposta sem JSON');
  const start = Math.min(...starts);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  return JSON.parse(text.slice(start, end + 1));
}
