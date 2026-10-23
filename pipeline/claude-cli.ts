// ============================================================
//  CLAUDE CODE EM MODO HEADLESS — escreve roteiros usando o plano do Claude
//  (sem ANTHROPIC_API_KEY). Chama `claude -p` sem ferramentas: só gera texto.
// ============================================================
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';

let cached: string | null | undefined;

/** Acha o executável: CLAUDE_CLI no .env → PATH → extensão do VS Code (versão mais nova) → instalador nativo */
export function findClaudeCli(): string | null {
  if (cached !== undefined) return cached;
  const candidates: string[] = [];
  if (process.env.CLAUDE_CLI) candidates.push(process.env.CLAUDE_CLI);
  try {
    const where = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
    candidates.push(...where.split(/\r?\n/).filter(Boolean));
  } catch {
    /* não está no PATH */
  }
  const home = os.homedir();
  for (const extDir of ['.vscode/extensions', '.cursor/extensions', '.vscode-insiders/extensions']) {
    const dir = path.join(home, extDir);
    if (!fs.existsSync(dir)) continue;
    const exts = fs
      .readdirSync(dir)
      .filter((d) => d.startsWith('anthropic.claude-code-'))
      .sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
    for (const e of exts) {
      candidates.push(path.join(dir, e, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude'));
    }
  }
  candidates.push(path.join(home, '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'));

  // .cmd/.ps1 do npm não rodam sem shell; preferimos binários
  cached = candidates.find((c) => fs.existsSync(c) && !/\.(cmd|ps1)$/i.test(c)) ?? null;
  return cached;
}

/** Uma pergunta, uma resposta em texto. `system` substitui o prompt padrão do Claude Code. */
export function askClaude(prompt: string, system: string, model: string, timeoutMs = 180_000): Promise<string> {
  const bin = findClaudeCli();
  if (!bin) return Promise.reject(new Error('Claude Code não encontrado. Instale a extensão do VS Code ou defina CLAUDE_CLI no .env.'));

  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      [
        '-p',
        '--output-format', 'json',
        '--tools', '', // nenhuma ferramenta: só escreve
        '--no-session-persistence',
        '--setting-sources', '', // ignora configurações/hooks do projeto
        '--strict-mcp-config',
        '--model', model,
        '--system-prompt', system,
      ],
      {cwd: os.tmpdir(), windowsHide: true},
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Claude Code demorou demais para responder.'));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const res = JSON.parse(out) as {result?: string; is_error?: boolean};
        if (res.is_error || typeof res.result !== 'string') throw new Error(res.result || 'resposta vazia');
        resolve(res.result);
      } catch (e) {
        const detail = (err || out || (e as Error).message).trim().slice(0, 400);
        reject(new Error(`Claude Code falhou (código ${code}): ${detail}. Se for login, abra o Claude Code e entre na sua conta.`));
      }
    });
    child.stdin.end(prompt);
  });
}
