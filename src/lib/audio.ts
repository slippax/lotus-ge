// tiny audio bleep for when new data lands

export class SimpleAudioSystem {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.1; // Very soft volume

  constructor() {
    this.initializeAudioContext();
    this.loadSettings();
  }

  private initializeAudioContext(): void {
    if (typeof window !== 'undefined') {
      try {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioContext = new AudioContextClass();
      } catch (error) {
        console.warn('Audio context not supported:', error);
      }
    }
  }

  private loadSettings(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('lotus-audio-enabled');
      if (saved !== null) {
        this.enabled = JSON.parse(saved);
      }
    }
  }

  private saveSettings(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('lotus-audio-enabled', JSON.stringify(this.enabled));
    }
  }

  // soft notification sound
  playDataRefreshSound(): void {
    if (!this.enabled || !this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // C5
      oscillator.frequency.setValueAtTime(523, this.audioContext.currentTime);
      oscillator.type = 'sine'; // Smoothest waveform

      // gentle envelope
      const now = this.audioContext.currentTime;
      const duration = 0.2; // Short duration
      
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(this.volume, now + 0.02); // Quick attack
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration); // Smooth fade

      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch (error) {
      console.warn('Failed to play refresh sound:', error);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.saveSettings();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // test the sound
  testSound(): void {
    this.playDataRefreshSound();
  }
}

// singleton
export const audioSystem = new SimpleAudioSystem();
