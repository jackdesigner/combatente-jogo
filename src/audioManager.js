/* src/audioManager.js */
class AudioManager {
  constructor() {
    // Music tracks
    this.mapMusic = new Audio('/map-music.mp3');
    this.battleMusic = new Audio('/battle-music.mp3');
    this.mapMusic.loop = true;
    this.battleMusic.loop = true;
    // Sound effects
    this.sfx = {
      'tiro-curto': new Audio('/tiro-curto.mp3'),
      'tiro-longo': new Audio('/tiro-longo.wav'),
      'granada': new Audio('/granada.mp3'),
      'morreu': new Audio('/morreu.wav')
    };
    // Volume settings (0-1)
    this.volumeGeral = 0.7; // master
    this.volumeMusica = 0.7; // BGM
    this.volumeEfeitos = 0.7; // SFX
    this.applyVolumes();
    this.currentMusic = null;
  }

  static getInstance() {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  applyVolumes() {
    const master = this.volumeGeral;
    const bgm = this.volumeMusica * master;
    const sfx = this.volumeEfeitos * master;
    if (this.mapMusic) this.mapMusic.volume = bgm;
    if (this.battleMusic) this.battleMusic.volume = bgm;
    Object.values(this.sfx).forEach(a => a.volume = sfx);
  }

  setVolume(master, bgm, sfx) {
    if (typeof master === 'number') this.volumeGeral = master;
    if (typeof bgm === 'number') this.volumeMusica = bgm;
    if (typeof sfx === 'number') this.volumeEfeitos = sfx;
    this.applyVolumes();
  }

  // Music handling
  playMusic(type) {
    const newMusic = type === 'battle' ? this.battleMusic : this.mapMusic;
    if (this.currentMusic === newMusic) return;
    // fade out current
    if (this.currentMusic) this._fadeOut(this.currentMusic);
    // fade in new
    this._fadeIn(newMusic);
    this.currentMusic = newMusic;
  }

  _fadeIn(audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    let vol = 0;
    const target = audio.volume; // already set by applyVolumes
    audio.volume = 0;
    const step = 0.05;
    const interval = setInterval(() => {
      vol = Math.min(target, vol + step);
      audio.volume = vol;
      if (vol >= target) clearInterval(interval);
    }, 60);
  }

  _fadeOut(audio) {
    const step = 0.05;
    const interval = setInterval(() => {
      if (audio.volume > step) {
        audio.volume = Math.max(0, audio.volume - step);
      } else {
        audio.volume = 0;
        audio.pause();
        clearInterval(interval);
      }
    }, 60);
  }

  // SFX handling (fire and forget)
  playSfx(name) {
    const a = this.sfx[name];
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  // Play SFX at a reduced volume (scale 0-1 relative to current SFX volume)
  playSfxAt(name, scale = 1) {
    const a = this.sfx[name];
    if (!a) return;
    const originalVol = a.volume;
    a.volume = Math.max(0, Math.min(1, originalVol * scale));
    a.currentTime = 0;
    a.play().catch(() => {});
    // Restore after playback (fire-and-forget, small timeout to ensure start)
    setTimeout(() => {
      a.volume = originalVol;
    }, 100);
  }
}
export default AudioManager;
