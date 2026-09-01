'use strict';

/**
 * MotionGo V2 Export Pipeline
 * Usage: node render-v2.js <composition.json> [--double-check]
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RENDERER_URL = process.env.RENDERER_URL || 'http://localhost:5174';
const FRAMES_DIR = path.join(__dirname, 'frames-v2');
const OUTPUT_DIR = path.join(__dirname, 'output');

function sha256file(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function removeIfExists(filePath) {
  try { fs.rmSync(filePath, { force: true }); } catch {}
}

function validatePNGs(framesDir, totalFrames) {
  const errors = [];
  for (let i = 0; i < totalFrames; i++) {
    const f = path.join(framesDir, `frame_${String(i).padStart(5, '0')}.png`);
    if (!fs.existsSync(f)) errors.push(`missing frame ${i}`);
  }
  const actual = fs.existsSync(framesDir)
    ? fs.readdirSync(framesDir).filter(n => n.endsWith('.png')).length
    : 0;
  if (actual !== totalFrames) errors.push(`expected ${totalFrames} PNGs, found ${actual}`);
  return errors;
}

function parseRate(rate) {
  if (typeof rate !== 'string') return NaN;
  const [numRaw, denRaw] = rate.split('/');
  const num = Number(numRaw);
  const den = Number(denRaw ?? 1);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return NaN;
  return num / den;
}

function validateMP4Probe(video, expectedFps, expectedFrames) {
  const issues = [];
  if (!video || typeof video !== 'object') throw new Error('ffprobe validation failed:\nno video stream');

  const fps = parseRate(video.r_frame_rate);
  const frameText = String(video.nb_read_frames ?? '');
  const frameCount = /^\d+$/.test(frameText) ? Number(frameText) : NaN;

  if (!Number.isFinite(fps) || Math.abs(fps - expectedFps) > 1e-6) issues.push(`fps: got ${video.r_frame_rate ?? 'missing'}, expected ${expectedFps}`);
  if (video.codec_name !== 'h264') issues.push(`codec: ${video.codec_name ?? 'missing'}`);
  if (video.pix_fmt !== 'yuv420p') issues.push(`pix_fmt: ${video.pix_fmt ?? 'missing'}`);
  if (video.width !== 1080 || video.height !== 1920) issues.push(`dimensions: ${video.width ?? '?'}x${video.height ?? '?'}`);
  if (!Number.isInteger(frameCount)) issues.push(`frame_count: got ${video.nb_read_frames ?? 'missing'}, expected ${expectedFrames}`);
  else if (frameCount !== expectedFrames) issues.push(`frame_count: got ${frameCount}, expected ${expectedFrames}`);

  if (issues.length) throw new Error(`ffprobe validation failed:\n${issues.join('\n')}`);
  return { width: video.width, height: video.height, fps, codec: video.codec_name, pixFmt: video.pix_fmt, frameCount };
}

function ffprobeArgs(outputPath) {
  return ['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate,nb_read_frames','-of','json',outputPath];
}

function validateMP4(outputPath, expectedFps, expectedFrames) {
  const probe = execFileSync('ffprobe', ffprobeArgs(outputPath), { encoding: 'utf8' });
  const streams = JSON.parse(probe).streams;
  const video = Array.isArray(streams) ? streams.find(s => s.codec_type === 'video') ?? streams[0] : null;
  return validateMP4Probe(video, expectedFps, expectedFrames);
}

async function captureSceneFrame(scene, framePath) {
  await scene.screenshot({ path: framePath, type: 'png', animations: 'disabled' });
}

async function renderJob(compositionPath, jobFramesDir) {
  const { chromium } = require('playwright');
  const composition = JSON.parse(fs.readFileSync(compositionPath, 'utf8'));
  if (fs.existsSync(jobFramesDir)) fs.rmSync(jobFramesDir, { recursive: true });
  fs.mkdirSync(jobFramesDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--disable-web-security','--font-render-hinting=none','--force-device-scale-factor=1','--disable-lcd-text'] });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1080, height: 1920 });
    await page.goto(RENDERER_URL, { waitUntil: 'networkidle' });
    const meta = await page.evaluate(async (comp) => window.__LOAD_COMPOSITION__(comp), composition);
    await page.waitForFunction(() => window.__RENDER_READY__ === true, { timeout: 30000 });
    const { totalFrames, fps } = meta;
    const scene = page.locator('#render-scene');
    for (let f = 0; f < totalFrames; f++) {
      await page.evaluate((frame) => window.__RENDER_FRAME__(frame), f);
      await captureSceneFrame(scene, path.join(jobFramesDir, `frame_${String(f).padStart(5, '0')}.png`));
    }
    return { totalFrames, fps };
  } finally {
    await browser.close();
  }
}

function detectH264Encoder() {
  try {
    const encoders = execFileSync('ffmpeg', ['-encoders'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
    if (encoders.includes('libx264')) return { encoder: 'libx264', opts: ['-preset','slow','-crf','17'] };
  } catch {}
  return { encoder: 'libopenh264', opts: ['-b:v','10000k'] };
}

function encode(jobFramesDir, tmpOutput, fps) {
  const { encoder, opts } = detectH264Encoder();
  execFileSync('ffmpeg', ['-y','-framerate',String(fps),'-i',path.join(jobFramesDir,'frame_%05d.png'),'-c:v',encoder,...opts,'-pix_fmt','yuv420p','-movflags','+faststart',tmpOutput], { stdio: 'inherit' });
}

async function runDoubleCheck(compositionPath, jobFramesDir, totalFrames, fps) {
  const jobFramesDir2 = `${jobFramesDir}_check`;
  try {
    const secondMeta = await renderJob(compositionPath, jobFramesDir2);
    if (secondMeta.totalFrames !== totalFrames || secondMeta.fps !== fps) throw new Error('double-check metadata mismatch');
    const secondPngErrors = validatePNGs(jobFramesDir2, totalFrames);
    if (secondPngErrors.length) throw new Error(secondPngErrors.join('\n'));
    for (let i = 0; i < totalFrames; i++) {
      const n = String(i).padStart(5, '0');
      if (sha256file(path.join(jobFramesDir, `frame_${n}.png`)) !== sha256file(path.join(jobFramesDir2, `frame_${n}.png`))) {
        throw new Error(`SHA mismatch at frame ${i}`);
      }
    }
  } finally {
    if (fs.existsSync(jobFramesDir2)) fs.rmSync(jobFramesDir2, { recursive: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const doubleCheck = args.includes('--double-check');
  const compositionFile = args.find(a => !a.startsWith('--'));
  if (!compositionFile) throw new Error('Usage: node render-v2.js <composition.json> [--double-check]');
  const compositionPath = path.resolve(compositionFile);
  const baseName = path.basename(compositionFile, path.extname(compositionFile));
  const jobFramesDir = path.join(FRAMES_DIR, baseName);
  const finalOutput = path.join(OUTPUT_DIR, `${baseName}.mp4`);
  const tmpOutput = `${finalOutput}.tmp.mp4`;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  removeIfExists(tmpOutput);

  try {
    const { totalFrames, fps } = await renderJob(compositionPath, jobFramesDir);
    const pngErrors = validatePNGs(jobFramesDir, totalFrames);
    if (pngErrors.length) throw new Error(pngErrors.join('\n'));
    encode(jobFramesDir, tmpOutput, fps);
    validateMP4(tmpOutput, fps, totalFrames);
    if (doubleCheck) await runDoubleCheck(compositionPath, jobFramesDir, totalFrames, fps);
    fs.renameSync(tmpOutput, finalOutput);
    console.log(`Output: ${finalOutput}`);
  } finally {
    removeIfExists(tmpOutput);
  }
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; });

module.exports = { captureSceneFrame, ffprobeArgs, parseRate, runDoubleCheck, validateMP4Probe, validateMP4, validatePNGs, renderJob, main };
