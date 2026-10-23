import fs from 'node:fs';
import path from 'node:path';
import {config, today} from './config';

fs.mkdirSync(config.paths.logs, {recursive: true});
const file = path.join(config.paths.logs, `${today()}.log`);

const write = (level: string, msg: string) => {
  const line = `[${new Date().toLocaleTimeString('pt-BR')}] ${level} ${msg}`;
  console.log(line);
  fs.appendFileSync(file, line + '\n');
};

export const log = {
  info: (m: string) => write('·', m),
  ok: (m: string) => write('✓', m),
  warn: (m: string) => write('!', m),
  error: (m: string) => write('✗', m),
  step: (m: string) => write('▶', m),
};
