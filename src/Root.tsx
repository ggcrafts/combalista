import React from 'react';
import {Composition} from 'remotion';
import {Short} from './Short';
import {VIDEO} from './theme';
import {totalDurationInFrames} from './timeline';
import {sampleProps} from './sample';
import type {VideoProps} from './types';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Short"
      component={Short as unknown as React.FC<Record<string, unknown>>}
      width={VIDEO.width}
      height={VIDEO.height}
      fps={VIDEO.fps}
      durationInFrames={totalDurationInFrames(sampleProps.segments)}
      defaultProps={sampleProps as unknown as Record<string, unknown>}
      calculateMetadata={({props}) => ({
        durationInFrames: totalDurationInFrames((props as unknown as VideoProps).segments),
      })}
    />
  );
};
