/**
 * Son 100 % synthétisé avec Web Audio — aucun fichier à télécharger.
 *  - ventilation : bruit brun filtré + souffle aigu + ronflement secteur 50 Hz (on est en France)
 *  - robot : sifflement de turbine qui suit la vitesse
 *  - interface : bips d'ouverture, sonar du ping, choc
 * Coupé par défaut ; le choix est mémorisé.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private fan!: GainNode;
  private motorGain!: GainNode;
  private motorOsc!: OscillatorNode;
  private motorFilter!: BiquadFilterNode;
  enabled = false;

  private init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // bruit brun (2 s en boucle)
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    this.fan = ctx.createGain();
    this.fan.gain.value = 0.55;
    this.fan.connect(this.master);

    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    noise.connect(low).connect(this.fan);

    // souffle aigu des ventilateurs
    const whirG = ctx.createGain();
    whirG.gain.value = 0.05;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1700;
    band.Q.value = 0.8;
    noise.connect(band).connect(whirG).connect(this.fan);

    // ronflement 50 Hz + harmonique
    for (const [f, g] of [[50, 0.035], [100, 0.018]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.fan);
      o.start();
    }
    // lente respiration de la ventilation
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.12;
    lfo.connect(lfoG).connect(this.fan.gain);
    lfo.start();
    noise.start();

    // turbine du robot
    this.motorOsc = ctx.createOscillator();
    this.motorOsc.type = 'sawtooth';
    this.motorOsc.frequency.value = 90;
    this.motorFilter = ctx.createBiquadFilter();
    this.motorFilter.type = 'lowpass';
    this.motorFilter.frequency.value = 400;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.motorOsc.connect(this.motorFilter).connect(this.motorGain).connect(this.master);
    this.motorOsc.start();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.init();
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') void this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.5 : 0, t, on ? 0.6 : 0.15);
  }

  update(speed: number, boost: boolean) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 6);
    this.motorGain.gain.setTargetAtTime(0.018 + s * 0.05, t, 0.08);
    this.motorOsc.frequency.setTargetAtTime(80 + s * 140 + (boost ? 40 : 0), t, 0.1);
    this.motorFilter.frequency.setTargetAtTime(300 + s * 1400, t, 0.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, to?: number) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  open() {
    this.tone(660, 0.09, 'sine', 0.12);
    this.tone(990, 0.12, 'sine', 0.1, 0.07);
  }

  close() {
    this.tone(700, 0.1, 'sine', 0.06, 0, 420);
  }

  ping() {
    this.tone(1320, 0.9, 'sine', 0.16);
    this.tone(1320, 0.7, 'sine', 0.05, 0.32);
    this.tone(1320, 0.5, 'sine', 0.02, 0.64);
  }

  bump(strength: number) {
    this.tone(110, 0.18, 'triangle', Math.min(0.25, strength * 0.05), 0, 60);
  }

  boot() {
    this.tone(220, 0.25, 'square', 0.04);
    this.tone(440, 0.3, 'square', 0.03, 0.12);
  }

  celebrate() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.1, i * 0.09));
  }
}
