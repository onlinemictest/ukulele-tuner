/**
 * Copyright (C) 2021 Online Mic Test
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 * @license
 */

import { initGetUserMedia } from "./init-get-user-media";
import { toggleClass } from "./dom-fns";
import { getNote, NoteString, Octave } from "./music-fns";
import { groupedUntilChanged, takeWhile } from "./iter";
import { closestBy, flat, queue } from "./array-fns";
import { isTruthy, once, set, throttle, timeout } from "./helper-fns";
import { clamp, round } from "./math-fns";

console.log('Licensed under AGPL-3.0: https://github.com/onlinemictest/ukulele-tuner')

const BUFFER_SIZE = 8192; // byte
const INTERVAL_TIME = 185; // ms
const VICTORY_DURATION = 3500; // ms

// Note buffer sizes
const NOTE_BUFFER_SIZE = 15;
const TUNE_BUFFER_SIZE = 5;

const NOTE_STRINGS: NoteString[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES: Octave[] = [1, 2, 3, 4, 5, 6, 7, 8];
const NOTES = flat(OCTAVES.map(o => NOTE_STRINGS.map(n => `${n}_${o}`)));

type Note_Octave = `${NoteString}_${Octave}`;

const UKULELE_FREQ = {
  'E_4': 329.63,
  'B_3': 246.94,
  'G_3': 196.00,
  'D_3': 146.83,
  'A_2': 110.00,
  'E_2': 82.41,
};

type GuitarNote_Octave = keyof typeof UKULELE_FREQ;

const UKULELE_NOTES = Object.keys(UKULELE_FREQ) as GuitarNote_Octave[];

const ANIM_DURATION = 500;

const translate = {
  X: 'translateX',
  Y: 'translateY',
};

const getClosestGuitarNote = (n?: Note_Octave) => n
  ? closestBy(UKULELE_NOTES, n, (a, b) => Math.abs(NOTES.indexOf(a) - NOTES.indexOf(b))) as GuitarNote_Octave
  : undefined;

initGetUserMedia();

const nonSilentGroup = (g: (Note_Octave | undefined)[]): g is Note_Octave[] =>
  g[0] !== undefined;

const MAGIC_NUMBER = 3;
const isNoisy = (currNote: GuitarNote_Octave | undefined) =>
  (g: (Note_Octave | undefined)[]) =>
    g[0] !== currNote || (g[0] === currNote && g.length <= MAGIC_NUMBER);

if (false
  || !('WebAssembly' in window)
  || !('AudioContext' in window)
  || !('createAnalyser' in AudioContext.prototype)
  || !('createScriptProcessor' in AudioContext.prototype)
) {
  if (!('WebAssembly' in window))
    throw alert(`Browser not supported: 'WebAssembly' is not defined`);
  if (!('AudioContext' in window))
    throw alert(`Browser not supported: 'AudioContext' is not defined`);
  if (!('createAnalyser' in AudioContext.prototype))
    throw alert(`Browser not supported: 'AudioContext.prototype.createAnalyser' is not defined`);
  if (!('createScriptProcessor' in AudioContext.prototype))
    throw alert(`Browser not supported: 'AudioContext.prototype.createScriptProcessor' is not defined`);
}

const blobAnimation: (startEl: HTMLElement) => void = 'animate' in Element.prototype
  ? el =>
    el.animate([{ transform: 'translateY(10vw) scale(0.33)' }, { transform: 'translateY(0) scale(1)' }], {
      duration: 125,
      easing: 'ease',
    })
  : el => toggleClass(el, 'blob-animation')

const shrinkAnimation: (pauseEl: HTMLElement) => void = 'animate' in Element.prototype
  ? el =>
    el.animate([{ transform: 'translateY(-10vw) scale(3) ' }, { transform: 'translateY(0) scale(1)' }], {
      duration: 125,
      easing: 'ease',
    })
  : el => toggleClass(el, 'shrink-animation');

// @ts-expect-error
Aubio().then(({ Pitch }) => {
  const ukuleleTuner = document.getElementById('ukulele-tuner') as HTMLDivElement | null;
  const startEl = document.getElementById('audio-start') as HTMLButtonElement | null;
  const pauseEl = document.getElementById('audio-pause') as HTMLButtonElement | null;
  const tuneUpText = document.getElementById('tune-up-text') as HTMLDivElement | null;
  const tuneDownText = document.getElementById('tune-down-text') as HTMLDivElement | null;
  const pressPlay = document.getElementById('circle-text-play') as HTMLSpanElement | null
  const pluckAString = document.getElementById('circle-text-pluck') as HTMLSpanElement | null;
  const allTunedUp = document.getElementById('circle-text-complete') as HTMLSpanElement | null;
  const errorEl = document.getElementById('circle-text-error') as HTMLSpanElement | null;
  const noteSpan = document.getElementById('circle-note') as HTMLSpanElement | null;
  const matchCircleL = document.getElementById('match-circle-l') as HTMLDivElement | null;
  const matchCircleR = document.getElementById('match-circle-r') as HTMLDivElement | null;
  const innerCircle = document.getElementById('inner-circle') as HTMLDivElement | null;

  const tunedJingle = document.getElementById('tuned-jingle') as HTMLAudioElement;
  tunedJingle.volume = 0.001;
  const JINGLE_VOLUME = 0.5; // set after initial play to get around Safari limitation

  const noteEls = new Map(Object.entries(UKULELE_FREQ)
    .map(([n]) => [n, document.getElementById(n) as unknown as SVGGElement]));

  const fillEls = new Map(Object.entries(UKULELE_FREQ)
    .map(([n]) => [n, document.getElementById(`${n}-fill`) as unknown as SVGGElement]));

  if (false
    || !ukuleleTuner
    || !startEl
    || !pauseEl
    || !tuneUpText
    || !tuneDownText
    || !pressPlay
    || !pluckAString
    || !allTunedUp
    || !errorEl
    || !noteSpan
    || !matchCircleL
    || !matchCircleR
    || !innerCircle
    || !tunedJingle
    || ![...noteEls.values()].every(isTruthy)
    || ![...fillEls.values()].every(isTruthy)
  ) {
    return alert('Expected HTML element missing');
  }

  const updateTuneText = throttle(500, (isClose: boolean, isTooLow: boolean) => {
    if (isClose) {
      tuneUpText.classList.remove('show');
      tuneDownText.classList.remove('show');
    } else {
      tuneUpText.classList[isTooLow ? 'add' : 'remove']('show');
      tuneDownText.classList[isTooLow ? 'remove' : 'add']('show');
    }
  });

  let audioContext: AudioContext;
  let analyser: AnalyserNode;
  let scriptProcessor: ScriptProcessorNode;
  let pitchDetector: Aubio.Pitch;
  let stream: MediaStream;
  let intervalId: number;

  matchCircleL.style.transform = `${translate.Y}(125%)`;

  const pauseCallback = () => {
    startEl.style.display = 'block';
    pauseEl.style.display = 'none';
    pressPlay.style.opacity = '1';
    pluckAString.style.opacity = '0';
    noteSpan.style.opacity = '0';
    noteSpan.style.color = '';
    matchCircleL.style.transform = `${translate.Y}(125%)`;
    tuneUpText.classList.remove('show');
    tuneDownText.classList.remove('show');
    updateTuneText(true);
    blobAnimation(startEl);
  };

  pauseEl.addEventListener('click', async () => {
    clearInterval(intervalId);
    pauseCallback();
    await Promise.race([once(startEl, 'animationend'), timeout(250)]);

    scriptProcessor.disconnect(audioContext.destination);
    analyser.disconnect(scriptProcessor);
    audioContext.close();
    stream.getTracks().forEach(track => track.stop());
  });

  startEl.addEventListener('click', async () => {
    await tunedJingle.play();
    await timeout(1600);
    tunedJingle.volume = JINGLE_VOLUME;
  }, { once: true });

  startEl.addEventListener('click', async () => {
    ukuleleTuner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    startEl.style.display = 'none';
    pauseEl.style.display = 'block';
    shrinkAnimation(pauseEl);

    await Promise.race([once(pauseEl, 'animationend'), timeout(250)]);

    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    pitchDetector = new Pitch('default', BUFFER_SIZE, 1, audioContext.sampleRate);
    pitchDetector.setSilence(-55);

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioContext.createMediaStreamSource(stream).connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      pressPlay.style.opacity = '0';
      errorEl.style.opacity = '0';
      pluckAString.style.opacity = '1';

      let resetable = false;
      let softResettable = false;
      let victory = false;
      let victoryPause = false;
      let prevNoteString: NoteString | undefined;
      let currNote: GuitarNote_Octave | undefined;
      let prevNote: GuitarNote_Octave | undefined;

      const noteBuffer: (Note_Octave | undefined)[] = new Array(NOTE_BUFFER_SIZE).fill(undefined);

      let centsBufferMap: Map<GuitarNote_Octave, number[]> = new Map(UKULELE_NOTES.map(n => [n, []]));
      let jinglePlayedMap: Map<GuitarNote_Octave, boolean> = new Map(UKULELE_NOTES.map(n => [n, false]));

      const initialEvent = await once(scriptProcessor, 'audioprocess');
      const initialBuffer = initialEvent.inputBuffer.getChannelData(0);

      let frequency = pitchDetector.do(initialBuffer);

      scriptProcessor.addEventListener('audioprocess', event => {
        // console.timeEnd('audioprocess');
        // console.time('audioprocess');

        const buffer = event.inputBuffer.getChannelData(0);
        frequency = pitchDetector.do(buffer);
      });

      intervalId = setInterval(() => {
        // console.timeEnd('interval');
        // console.time('interval');

        if (victoryPause) return;

        const note = getNote(frequency);

        const noteName = note.name ? `${note.name}_${note.octave}` as Note_Octave : undefined;
        queue(noteBuffer, noteName);

        const groupedByNote = [...groupedUntilChanged(noteBuffer)];
        const groupedByNoteNonSilent = groupedByNote.filter(nonSilentGroup)

        currNote = getClosestGuitarNote(groupedByNoteNonSilent.find(g => g.length > MAGIC_NUMBER)?.[0]);

        // If there has been nothing but noise for the last couple of seconds:
        const isLongNoise = groupedByNoteNonSilent.every(g => g.length <= MAGIC_NUMBER);

        // If there are 3 or more groups in front of the current note, we consider that noise as well:
        const isShortNoise = [...takeWhile(groupedByNoteNonSilent, isNoisy(currNote))].length >= 3;

        if (process.env.DEBUG) {
          console.log(groupedByNote.map(g => g.map(n => n === undefined
            ? '-'
            : n.includes('#')
              ? n.charAt(0).toLocaleLowerCase()
              : n.charAt(0)).join('')).join(''));
        }

        if (isLongNoise && resetable) {
          currNote = undefined;
          resetable = false; // prevent repeated resets
          pressPlay.style.opacity = '0';
          pluckAString.style.opacity = '1';
          noteSpan.style.opacity = '0';
          noteSpan.style.color = '';
          matchCircleL.style.transform = `${translate.Y}(125%)`;
          updateTuneText(true);
        }
        else if (currNote && !Number.isNaN(note.cents)) {
          if (tunedJingle.paused) {
            resetable = true;
            softResettable = true;

            const ukuleleNoteName = currNote;

            const isTooLow = frequency < UKULELE_FREQ[ukuleleNoteName];

            const baseCents = noteName === ukuleleNoteName
              ? note.cents
              : isTooLow ? -50 : 50;

            const absCents100 = Math.abs(baseCents) * 2;
            const sensitivity = Math.min(10, Math.round(100 / absCents100));
            const centsRounded = round(baseCents, sensitivity);

            const centsBuffer = centsBufferMap.get(ukuleleNoteName) ?? [];
            const jinglePlayed = jinglePlayedMap.get(ukuleleNoteName) ?? false;
            if (noteName === ukuleleNoteName && centsRounded === 0) centsBuffer.push(0);

            const tuneRatio = clamp(centsBuffer.length / TUNE_BUFFER_SIZE);

            const centsUI = centsRounded * (1 - tuneRatio);

            const isClose = noteName === ukuleleNoteName && centsUI === 0;
            updateTuneText(isClose, isTooLow);

            pluckAString.style.opacity = '0';
            noteSpan.style.opacity = '1';
            const currNoteString = ukuleleNoteName.split('_')[0] as NoteString;
            if (prevNoteString !== currNoteString) noteSpan.innerText = currNoteString
            prevNoteString = currNoteString;

            innerCircle.style.transition = `transform ${ANIM_DURATION}ms ease`
            innerCircle.style.transform = `scale(${1 - tuneRatio})`;

            noteSpan.style.transition = `color ${ANIM_DURATION}ms ease`
            noteSpan.style.color = tuneRatio === 1 ? '#fbfbfb' : '#fbfbfb88';

            matchCircleL.style.transition = `transform ${ANIM_DURATION}ms ease`;
            matchCircleL.style.transform = `${translate.Y}(${-centsUI}%)`;

            if (tuneRatio === 1 && !jinglePlayed) {
              set(noteEls.get(ukuleleNoteName)?.querySelector('path')?.style, 'fill', 'rgb(67,111,142)');
              set(fillEls.get(ukuleleNoteName)?.style, 'display', 'block');
              jinglePlayedMap.set(ukuleleNoteName, true);

              // give animation time to finish
              timeout(ANIM_DURATION).then(() => {
                tunedJingle.play();
                toggleClass(noteSpan, 'explode');

                if ([...fillEls.values()].every(el => el.style.display === 'block') && !victory) {
                  victory = true;
                  victoryPause = true;
                  ukuleleTuner.classList.add('all-tuned-up');
                  noteSpan.style.opacity = '0';
                  allTunedUp.style.opacity = '1';
                  toggleClass(allTunedUp, 'explode');

                  // Do a reset
                  currNote = undefined;
                  jinglePlayedMap = new Map(UKULELE_NOTES.map(n => [n, false]));
                  centsBufferMap = new Map(UKULELE_NOTES.map(n => [n, []]));
                  matchCircleL.style.transform = `${translate.Y}(125%)`;
                  updateTuneText(true);

                  timeout(VICTORY_DURATION).then(() => {
                    victoryPause = false;
                    ukuleleTuner.classList.remove('all-tuned-up');
                    allTunedUp.style.opacity = '0';
                  });
                }
              });
            }
          }
        }

        const isSilence = groupedByNote[0][0] === undefined && groupedByNote[0].length >= 2;
        const isNoteChange = prevNote !== currNote;
        prevNote = currNote;

        if (softResettable && isNoteChange) {
          innerCircle.style.transition = 'transform 100ms'
          innerCircle.style.transform = `scale(1)`;
          softResettable = false;
          jinglePlayedMap = new Map(UKULELE_NOTES.map(n => n === currNote
            ? [n, jinglePlayedMap.get(n) ?? false]
            : [n, false]));
          centsBufferMap = new Map(UKULELE_NOTES.map(n => n === currNote
            ? [n, centsBufferMap.get(n) ?? []]
            : [n, []]));
        }
        else if (softResettable && (isSilence || isShortNoise)) {
          currNote = undefined;
          innerCircle.style.transition = 'transform 100ms'
          innerCircle.style.transform = `scale(1)`;
          softResettable = false;
          jinglePlayedMap = new Map(UKULELE_NOTES.map(n => [n, false]));
          centsBufferMap = new Map(UKULELE_NOTES.map(n => [n, []]));
        }
      }, INTERVAL_TIME);
    } catch (err) {
      clearInterval(intervalId);
      pauseCallback();
      pressPlay.style.opacity = '0';
      errorEl.innerText = err.message;
      errorEl.style.opacity = '1';
    };
  });

});
