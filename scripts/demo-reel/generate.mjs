#!/usr/bin/env node
/**
 * Demo reel generator — TTS + captioned screenshots → MP4.
 *
 * Pipeline:
 *   1. Load captions.json
 *   2. For each scene: OpenAI TTS → audio/NN.mp3
 *   3. ffprobe each MP3 to get duration
 *   4. ImageMagick: letterbox screenshot + burn caption panel → frames/NN.png
 *   5. ffmpeg: per-scene clip (still image + audio + trailing silence) → clips/NN.mp4
 *   6. ffmpeg concat all clips → out/demo-reel.mp4
 *
 * Env:
 *   OPENAI_API_KEY — required. Auto-sourced from ~/Workspace/dev/apps/rally-hq/.env.local if missing.
 *   TTS_VOICE      — optional override (default: captions.voice or 'onyx')
 *   SKIP_TTS       — '1' to reuse existing audio/*.mp3 files (faster iteration)
 *   SKIP_FRAMES    — '1' to reuse existing frames/*.png files
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SCREENSHOTS_DIR = path.join(ROOT, 'screenshots');
const AUDIO_DIR = path.join(ROOT, 'audio');
const FRAMES_DIR = path.join(ROOT, 'frames');
const CLIPS_DIR = path.join(ROOT, 'clips');
const OUT_DIR = path.join(ROOT, 'out');

for (const d of [AUDIO_DIR, FRAMES_DIR, CLIPS_DIR, OUT_DIR]) fs.mkdirSync(d, { recursive: true });

// ─── env ───────────────────────────────────────────────────────────
// ─── env ───────────────────────────────────────────────────────────
// Supports two TTS backends:
//   1. ElevenLabs (default if ELEVENLABS_API_KEY is set)
//   2. OpenAI (fallback)

function loadKey(name, searchPaths = []) {
	if (process.env[name]) return process.env[name];
	for (const p of searchPaths) {
		if (!fs.existsSync(p)) continue;
		const match = fs.readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.+)$`, 'm'));
		if (match) return match[1].trim().replace(/^["']|["']$/g, '');
	}
	return null;
}

const rallyEnv = path.resolve(process.env.HOME || '', 'Workspace/dev/apps/rally-hq/.env.local');
const ELEVENLABS_API_KEY = loadKey('ELEVENLABS_API_KEY', [rallyEnv, path.join(ROOT, '.env')]);
const OPENAI_API_KEY = loadKey('OPENAI_API_KEY', [rallyEnv]);
const TTS_BACKEND = ELEVENLABS_API_KEY ? 'elevenlabs' : 'openai';

if (!ELEVENLABS_API_KEY && !OPENAI_API_KEY) {
	throw new Error('Set ELEVENLABS_API_KEY (preferred) or OPENAI_API_KEY for TTS');
}

// ─── config ────────────────────────────────────────────────────────
const captions = JSON.parse(fs.readFileSync(path.join(ROOT, 'captions.json'), 'utf-8'));
const VOICE = process.env.TTS_VOICE || captions.voice || 'coral';
const TTS_MODEL = process.env.TTS_MODEL || captions.model || 'eleven_multilingual_v2';
const TTS_INSTRUCTIONS = captions.instructions || null;
const DEFAULT_HOLD_S = captions.defaultHoldSeconds ?? 0.4;

// ElevenLabs voice IDs for pre-built voices good for demos/narration
const ELEVENLABS_VOICES = {
	'george': 'JBFqnCBsd6RMkjVDRZzb',    // British, warm, narration
	'rachel': '21m00Tcm4TlvDq8ikWAM',     // American, clear, professional
	'adam': 'pNInz6obpgDQGcFmaJgB',        // American, deep, confident
	'josh': 'TxGEqnHWrfWFTfGW9XjX',       // American, conversational
	'sam': 'yoZ06aMxZJJ28mfd3POQ',         // American, casual
	'charlie': 'IKne3meq5aSn9XLyUdCD',     // Australian, friendly
};

// Landscape 16:10 matching the recaptured Playwright viewport (1440×900).
// Screenshots composite full-bleed; captions overlay as a translucent band at the bottom.
const VIDEO_W = 1440;
const VIDEO_H = 900;
const CAPTION_BAND_H = 220;
const CAPTION_PAD_X = 60;
const CAPTION_PAD_TOP = 22;
const TITLE_FONT_SIZE = 30;
const CAPTION_FONT_SIZE = 20;
const COUNTER_FONT_SIZE = 14;
const BG_COLOR = '#0a0a0a';
const ACCENT_COLOR = '#10b981';

// ─── helpers ───────────────────────────────────────────────────────
function sh(cmd, args, opts = {}) {
	return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], ...opts }).toString().trim();
}

async function generateTTS(text, outputPath) {
	if (TTS_BACKEND === 'elevenlabs') {
		return generateTTS_ElevenLabs(text, outputPath);
	}
	return generateTTS_OpenAI(text, outputPath);
}

async function generateTTS_ElevenLabs(text, outputPath) {
	const voiceId = ELEVENLABS_VOICES[VOICE.toLowerCase()] || VOICE;
	const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
		method: 'POST',
		headers: {
			'xi-api-key': ELEVENLABS_API_KEY,
			'Content-Type': 'application/json',
			'Accept': 'audio/mpeg',
		},
		body: JSON.stringify({
			text,
			model_id: TTS_MODEL,
			voice_settings: {
				stability: 0.55,         // balanced — natural, not robotic
				similarity_boost: 0.80,
				style: 0.25,             // subtle style, not theatrical
				use_speaker_boost: true,
			},
		}),
	});
	if (!res.ok) throw new Error(`ElevenLabs TTS failed (${res.status}): ${await res.text()}`);
	const buf = Buffer.from(await res.arrayBuffer());
	fs.writeFileSync(outputPath, buf);
}

async function generateTTS_OpenAI(text, outputPath) {
	const payload = {
		model: TTS_MODEL,
		voice: VOICE,
		input: text,
		response_format: 'mp3',
	};
	if (TTS_INSTRUCTIONS && TTS_MODEL.startsWith('gpt-4o')) {
		payload.instructions = TTS_INSTRUCTIONS;
	}
	const res = await fetch('https://api.openai.com/v1/audio/speech', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${OPENAI_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw new Error(`OpenAI TTS failed (${res.status}): ${await res.text()}`);
	const buf = Buffer.from(await res.arrayBuffer());
	fs.writeFileSync(outputPath, buf);
}

function probeDuration(mp3Path) {
	const out = sh('ffprobe', [
		'-v', 'error',
		'-show_entries', 'format=duration',
		'-of', 'default=noprint_wrappers=1:nokey=1',
		mp3Path,
	]);
	return parseFloat(out);
}

function buildFrame(scene, index, framePath) {
	const src = path.join(SCREENSHOTS_DIR, scene.image);
	if (!fs.existsSync(src)) throw new Error(`Screenshot not found: ${src}`);

	const idx = String(index + 1).padStart(2, '0');
	const totalScenes = captions.scenes.length;
	const progress = `${idx} / ${String(totalScenes).padStart(2, '0')}`;

	const captionText = scene.caption;
	const titleText = scene.title;

	// Screenshot crop: from top of the source, sized to fill the full VIDEO_W×VIDEO_H.
	// Caption band can be anchored top or bottom (default bottom). When a scene's UI
	// is anchored to the same edge as the band — e.g. a chat FAB pinned bottom-right —
	// flip the band to the opposite edge so it doesn't obscure that UI.
	const position = scene.captionPosition || 'bottom';
	const textWidth = VIDEO_W - CAPTION_PAD_X * 2;
	const captionBandY = position === 'top' ? 0 : VIDEO_H - CAPTION_BAND_H;
	const accentLineY = position === 'top' ? CAPTION_BAND_H - 2 : captionBandY;
	const titleY = captionBandY + CAPTION_PAD_TOP;
	const bodyY = titleY + TITLE_FONT_SIZE + 14;

	const args = [
		// 1. Screenshot full-bleed — resize to fill, crop overflow from bottom
		src,
		'-resize', `${VIDEO_W}x${VIDEO_H}^`,
		'-gravity', 'north',
		'-background', BG_COLOR,
		'-extent', `${VIDEO_W}x${VIDEO_H}`,

		// 2. Translucent caption band (rgba so it blends with the screenshot)
		'(',
			'-size', `${VIDEO_W}x${CAPTION_BAND_H}`,
			'xc:rgba(10,10,10,0.88)',
		')',
		'-gravity', 'northwest',
		'-geometry', `+0+${captionBandY}`,
		'-composite',

		// 3. Emerald hairline on the inner edge of the band (separates band from screenshot)
		'(',
			'-size', `${VIDEO_W}x2`,
			`xc:${ACCENT_COLOR}`,
		')',
		'-gravity', 'northwest',
		'-geometry', `+0+${accentLineY}`,
		'-composite',

		// 4. Scene counter — tiny, top-right of the caption band
		'-font', 'Helvetica',
		'-pointsize', String(COUNTER_FONT_SIZE),
		'-fill', '#737373',
		'-gravity', 'northeast',
		'-annotate', `+${CAPTION_PAD_X}+${captionBandY + CAPTION_PAD_TOP + 6}`, progress,

		// 5. Title — bold, left-aligned inside the band
		'-font', 'Helvetica-Bold',
		'-pointsize', String(TITLE_FONT_SIZE),
		'-fill', '#f5f5f5',
		'-gravity', 'northwest',
		'-annotate', `+${CAPTION_PAD_X}+${titleY}`, titleText,

		// 6. Caption body — wrapped via a temp caption: image, composited under the title
		'(',
			'-background', 'none',
			'-fill', '#d4d4d4',
			'-font', 'Helvetica',
			'-pointsize', String(CAPTION_FONT_SIZE),
			'-size', `${textWidth}x${CAPTION_BAND_H - (bodyY - captionBandY) - CAPTION_PAD_TOP}`,
			`caption:${captionText}`,
		')',
		'-gravity', 'northwest',
		'-geometry', `+${CAPTION_PAD_X}+${bodyY}`,
		'-composite',

		framePath,
	];
	execFileSync('magick', args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

function buildClip(sceneIndex, framePath, audioPath, totalDuration, clipPath) {
	const hold = captions.scenes[sceneIndex].holdSeconds ?? DEFAULT_HOLD_S;
	const args = [
		'-y',
		'-loop', '1', '-i', framePath,
		'-i', audioPath,
		'-filter_complex', `[1:a]apad=pad_dur=${hold}[a]`,
		'-map', '0:v', '-map', '[a]',
		'-c:v', 'libx264',
		'-tune', 'stillimage',
		'-pix_fmt', 'yuv420p',
		'-r', '30',
		'-c:a', 'aac', '-b:a', '192k',
		'-t', totalDuration.toFixed(3),
		'-shortest',
		clipPath,
	];
	execFileSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

// ─── main ──────────────────────────────────────────────────────────
async function main() {
	const skipTTS = process.env.SKIP_TTS === '1';
	const skipFrames = process.env.SKIP_FRAMES === '1';

	console.log(`\nDemo reel generator`);
	console.log(`  voice: ${VOICE} (${TTS_BACKEND}: ${TTS_MODEL})`);
	console.log(`  scenes: ${captions.scenes.length}`);
	console.log(`  output: ${path.join(OUT_DIR, 'demo-reel.mp4')}\n`);

	// Step 1: TTS
	console.log('[1/4] Generating TTS audio');
	for (let i = 0; i < captions.scenes.length; i++) {
		const scene = captions.scenes[i];
		const idx = String(i + 1).padStart(2, '0');
		const audioPath = path.join(AUDIO_DIR, `${idx}.mp3`);
		if (skipTTS && fs.existsSync(audioPath)) {
			console.log(`  ${idx} cached`);
			continue;
		}
		console.log(`  ${idx} → ${scene.caption.length} chars`);
		await generateTTS(scene.caption, audioPath);
		await new Promise((r) => setTimeout(r, 800));
	}

	// Step 2: Frames
	console.log('\n[2/4] Building captioned frames');
	for (let i = 0; i < captions.scenes.length; i++) {
		const idx = String(i + 1).padStart(2, '0');
		const framePath = path.join(FRAMES_DIR, `${idx}.png`);
		if (skipFrames && fs.existsSync(framePath)) {
			console.log(`  ${idx} cached`);
			continue;
		}
		console.log(`  ${idx} → ${captions.scenes[i].image}`);
		buildFrame(captions.scenes[i], i, framePath);
	}

	// Step 3: Clips
	console.log('\n[3/4] Rendering per-scene clips');
	const clipPaths = [];
	for (let i = 0; i < captions.scenes.length; i++) {
		const idx = String(i + 1).padStart(2, '0');
		const audioPath = path.join(AUDIO_DIR, `${idx}.mp3`);
		const framePath = path.join(FRAMES_DIR, `${idx}.png`);
		const clipPath = path.join(CLIPS_DIR, `${idx}.mp4`);
		const audioSec = probeDuration(audioPath);
		const totalSec = audioSec + (captions.scenes[i].holdSeconds ?? DEFAULT_HOLD_S);
		console.log(`  ${idx} audio=${audioSec.toFixed(2)}s total=${totalSec.toFixed(2)}s`);
		buildClip(i, framePath, audioPath, totalSec, clipPath);
		clipPaths.push(clipPath);
	}

	// Step 4: Concat
	console.log('\n[4/4] Concatenating clips');
	const concatFile = path.join(ROOT, 'concat.txt');
	fs.writeFileSync(
		concatFile,
		clipPaths.map((p) => `file '${p}'`).join('\n') + '\n',
	);
	const outFile = path.join(OUT_DIR, 'demo-reel.mp4');
	execFileSync(
		'ffmpeg',
		[
			'-y',
			'-f', 'concat',
			'-safe', '0',
			'-i', concatFile,
			'-c:v', 'libx264',
			'-pix_fmt', 'yuv420p',
			'-r', '30',
			'-c:a', 'aac',
			'-b:a', '192k',
			'-movflags', '+faststart',
			outFile,
		],
		{ stdio: ['ignore', 'inherit', 'inherit'] },
	);

	const stat = fs.statSync(outFile);
	console.log(`\n✓ ${outFile}`);
	console.log(`  ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
	console.error('\n✗', err.message);
	process.exit(1);
});
