// ============================================================
//  RENDER — Remotion programático (bundle uma vez, renderiza N vídeos)
// ============================================================
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {config} from './config';
import {log} from './log';
import type {VideoProps} from '../src/types';

const COMPOSITION = 'Short';

export async function makeBundle(): Promise<string> {
  log.step('Empacotando template Remotion...');
  // O bundle copia a pasta public/ — por isso ele é feito depois de baixar os assets.
  return bundle({
    entryPoint: path.join(config.paths.root, 'src', 'index.ts'),
    publicDir: path.join(config.paths.root, 'public'),
  });
}

export async function renderVideo(serveUrl: string, props: VideoProps, outDir: string) {
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({serveUrl, id: COMPOSITION, inputProps});

  const video = path.join(outDir, 'video_9x16.mp4');
  let lastPct = -10;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 18,
    audioCodec: 'aac',
    outputLocation: video,
    inputProps,
    onProgress: ({progress}) => {
      const pct = Math.floor(progress * 100);
      if (pct - lastPct >= 10) {
        lastPct = pct;
        log.info(`  render ${pct}%`);
      }
    },
  });

  // capa: um frame no meio do gancho
  const hook = props.segments[0];
  const coverFrame = Math.min(
    composition.durationInFrames - 1,
    Math.round((hook ? hook.durationInSeconds * 0.75 : 1) * composition.fps),
  );
  await renderStill({
    composition,
    serveUrl,
    output: path.join(outDir, 'capa.jpg'),
    inputProps,
    frame: coverFrame,
    imageFormat: 'jpeg',
  });

  return {video, durationSec: composition.durationInFrames / composition.fps};
}
