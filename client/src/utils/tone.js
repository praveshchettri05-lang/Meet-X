/**
 * Plays an attention-check tone using the Web Audio API.
 * No audio files needed — pure browser synthesis.
 *
 * @param {'ping' | 'alarm' | 'success'} type - Type of tone to play
 */
export function playTone(type = 'ping') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      console.warn('Web Audio API not supported');
      return;
    }

    const ctx = new AudioContext();

    switch (type) {
      case 'ping':
        playPingTone(ctx);
        break;
      case 'alarm':
        playAlarmTone(ctx);
        break;
      case 'success':
        playSuccessTone(ctx);
        break;
      default:
        playPingTone(ctx);
    }

    // Auto-close context after tones finish
    setTimeout(() => ctx.close(), 4000);
  } catch (err) {
    console.error('Failed to play tone:', err);
  }
}

/**
 * Attention-check ping tone: 3 ascending beeps.
 * Sounds like a notification to grab attention.
 */
function playPingTone(ctx) {
  const notes = [
    { freq: 523.25, start: 0 },      // C5
    { freq: 659.25, start: 0.25 },   // E5
    { freq: 783.99, start: 0.5 },    // G5
  ];

  notes.forEach(({ freq, start }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

    gain.gain.setValueAtTime(0, ctx.currentTime + start);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.3);

    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + 0.3);
  });
}

/**
 * Alarm tone: repeating 2-tone alert for urgent attention checks.
 */
function playAlarmTone(ctx) {
  for (let i = 0; i < 3; i++) {
    const t = i * 0.5;

    [880, 660].forEach((freq, j) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + t + j * 0.2);

      gain.gain.setValueAtTime(0.15, ctx.currentTime + t + j * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + j * 0.2 + 0.18);

      osc.start(ctx.currentTime + t + j * 0.2);
      osc.stop(ctx.currentTime + t + j * 0.2 + 0.2);
    });
  }
}

/**
 * Success tone: gentle upward arpeggio confirming a reaction was received.
 */
function playSuccessTone(ctx) {
  [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);

    gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.12 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.25);

    osc.start(ctx.currentTime + i * 0.12);
    osc.stop(ctx.currentTime + i * 0.12 + 0.25);
  });
}
