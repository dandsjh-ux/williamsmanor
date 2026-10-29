// Converts the raw files in the project folder into the game's public/audio and
// public/assets folders. Needs ffmpeg on the PATH. Run with: npm run assets
//
// Positional sounds are made mono (three.js PositionalAudio pans them itself).
// Where only one recording exists for a numbered set, extra variants are derived
// by pitch-shifting or reversing it, so the game has something to pick from.
// Replace any derived file with a real recording at any time.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const audioOut = join(root, 'public', 'audio');
const assetOut = join(root, 'public', 'assets');
const portraitOut = join(assetOut, 'portraits');
for (const d of [audioOut, assetOut, portraitOut]) mkdirSync(d, { recursive: true });

const MONO = ['-ac', '1', '-ar', '44100', '-b:a', '64k'];
const STEREO = ['-ac', '2', '-ar', '44100', '-b:a', '64k'];
const TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB';
const pitch = (f) => `asetrate=${Math.round(44100 * f)},aresample=44100`;

function ffmpeg(args, label) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.warn(`  ! ${label}: ${(r.stderr || '').trim().split('\n').pop()}`);
    return false;
  }
  return true;
}

function src(name) {
  const p = join(root, name);
  if (!existsSync(p) || statSync(p).size < 1024) return null; // missing or empty file
  return p;
}

// [output name, source file, audio filter (or null), channel preset]
const sounds = [
  ['flicker_01', 'flicker_01.mp3', null, MONO],
  ['flicker_02', 'flicker_01.mp3', `${pitch(0.82)},atrim=0.6`, MONO],
  ['knock_01', 'door_knock_#1-1793281953961.mp3', TRIM, MONO],
  ['knock_02', 'door_knock_#2-1793281971124.mp3', TRIM, MONO],
  ['knock_03', 'door_knock_#1-1793281953961.mp3', `${TRIM},${pitch(0.86)},lowpass=f=1800`, MONO],
  ['whisper_01', 'whisper_01.mp3', null, MONO],
  ['whisper_02', 'whisper_01.mp3', `areverse,${pitch(0.94)}`, MONO],
  ['whisper_03', 'whisper_01.mp3', `${pitch(0.86)},atrim=4`, MONO],
  ['footsteps_01', 'footsteps_01.mp3', null, MONO],
  ['footsteps_02', 'footsteps_on_wood_#4-1793282026326.mp3', null, MONO],
  ['creak_01', 'wooden_creaking_#2-1793282133102.mp3', TRIM, MONO],
  ['creak_02', 'wooden_creaking_#4-1793282139685.mp3', TRIM, MONO],
  ['creak_03', 'wooden_creaking_#2-1793282133102.mp3', `${TRIM},${pitch(0.78)}`, MONO],
  ['creak_04', 'wooden_creaking_#4-1793282139685.mp3', `${TRIM},${pitch(1.15)}`, MONO],
  ['door_slam', 'Door🚪 Slam - (Loud) Sound.mp3', TRIM, MONO],
  ['music_box', 'Horror music box sound effect.mp3', null, ['-ac', '1', '-ar', '44100', '-b:a', '56k']],
  ['clock_tick', 'clock_tick.mp3', null, MONO],
  ['clock_chime', 'clock chimes - Sound Effect (HD).mp3', null, MONO],
  ['scratch', 'Scratching sound effect.mp3', TRIM, MONO],
  ['heartbeat', 'Heartbeat Sound Effect.mp3', null, STEREO],
  ['flashlight_click', 'flashlight_click_#1-1793282090185.mp3', TRIM, MONO],
  ['paper_pickup', 'Paper_pickup.mp3', TRIM, MONO],
  ['lock_open', 'lock_open.mp3', TRIM, MONO],
  ['menu_theme', 'maintheme and background.mp3', null, ['-ac', '2', '-b:a', '48k']],
  ['rain_loop', 'rain loop sound effect.mp3', null, STEREO],
];

console.log('Audio -> public/audio');
for (const [out, file, filter, ch] of sounds) {
  const input = src(file);
  const dest = join(audioOut, `${out}.mp3`);
  if (!input) {
    if (out === 'rain_loop') {
      // The supplied rain file is empty: synthesise a soft stereo rain bed instead.
      ffmpeg(['-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.5:d=24:seed=7',
        '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.5:d=24:seed=11',
        '-filter_complex', '[0][1]amerge=inputs=2,highpass=f=350,lowpass=f=5200,volume=0.6,afade=t=in:d=0.4,afade=t=out:st=23.6:d=0.4',
        ...STEREO, dest], out);
      console.log(`  ~ ${out} (synthesised: "${file}" is empty)`);
    } else {
      console.log(`  - ${out} skipped (no "${file}")`);
    }
    continue;
  }
  const args = ['-i', input];
  if (filter) args.push('-af', filter);
  args.push('-map_metadata', '-1', '-vn', ...ch, dest);
  if (ffmpeg(args, out)) console.log(`  + ${out} (${Math.round(statSync(dest).size / 1024)} KB)`);
}

// Images. Melissa's photo is cropped from the missing-person poster; the watermark
// at the bottom of portrait1 is cropped away.
const images = [
  ['melissa.jpg', assetOut, 'missingposter.jpg', 'crop=430:480:298:265,scale=860:960:flags=lanczos'],
  ['missing_poster.jpg', assetOut, 'missingposter.jpg', 'scale=1024:1024'],
  ['steven_i.jpg', portraitOut, 'portrait2.jpg', 'scale=800:-2:flags=lanczos'],
  ['steven_ii.jpg', portraitOut, 'portrait1.jpg', 'crop=495:530:0:0,scale=800:-2:flags=lanczos'],
  ['steven_iii.jpg', portraitOut, 'portraitmanwoman.jpg', 'scale=800:-2:flags=lanczos'],
  ['steven_iv.jpg', portraitOut, 'williamsivportrait.png', 'scale=800:-2:flags=lanczos'],
];

console.log('Images -> public/assets');
for (const [out, dir, file, vf] of images) {
  const input = src(file);
  if (!input) { console.log(`  - ${out} skipped (no "${file}")`); continue; }
  const dest = join(dir, out);
  if (ffmpeg(['-i', input, '-vf', vf, '-q:v', '3', dest], out)) console.log(`  + ${out}`);
}
