import { Subject } from 'rxjs';

// Constants for audio encoding
const SAMPLE_RATE = 48000;
const CHAR_DURATION = 0.05; // Faster transmission
const BASE_FREQUENCY = 2000; // Higher frequency range for better distinction
const FREQUENCY_STEP = 150; // Larger steps for better separation
const START_MARKER_FREQ = 1800;
const END_MARKER_FREQ = 1600;

// Enhanced error correction
const SIGNAL_THRESHOLD = 150; // Minimum signal strength
const FREQUENCY_TOLERANCE = 40; // Frequency matching tolerance

export class AudioCodec {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private decoder$ = new Subject<string>();
  private analyser: AnalyserNode | null = null;

  private async initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  private charToFrequency(char: string): number {
    return BASE_FREQUENCY + (char.charCodeAt(0) * FREQUENCY_STEP);
  }

  private frequencyToChar(frequency: number): string {
    const charCode = Math.round((frequency - BASE_FREQUENCY) / FREQUENCY_STEP);
    return String.fromCharCode(charCode);
  }

  public getAnalyser() {
    return this.analyser;
  }

  private async generateTone(frequency: number, duration: number): Promise<AudioBuffer> {
    const ctx = await this.initAudioContext();
    const samples = Math.ceil(duration * ctx.sampleRate);
    const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Add fade in/out to reduce clicking
    const fadeSamples = Math.ceil(0.002 * ctx.sampleRate);
    for (let i = 0; i < samples; i++) {
      const fade = i < fadeSamples 
        ? i / fadeSamples 
        : i > samples - fadeSamples 
          ? (samples - i) / fadeSamples 
          : 1;
      data[i] = Math.sin(2 * Math.PI * frequency * (i / ctx.sampleRate)) * fade;
    }

    return buffer;
  }

  public async encodeText(text: string): Promise<void> {
    const ctx = await this.initAudioContext();

    const startMarker = await this.generateTone(START_MARKER_FREQ, CHAR_DURATION);
    const tones = await Promise.all(
      text.split('').map(char => 
        this.generateTone(this.charToFrequency(char), CHAR_DURATION)
      )
    );
    const endMarker = await this.generateTone(END_MARKER_FREQ, CHAR_DURATION);

    const playBuffer = async (buffer: AudioBuffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
      return new Promise(resolve => 
        setTimeout(resolve, buffer.duration * 1000)
      );
    };

    await playBuffer(startMarker);
    for (const tone of tones) {
      await playBuffer(tone);
    }
    await playBuffer(endMarker);
  }

  public async startListening(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      
      const ctx = await this.initAudioContext();
      
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 4096; // Higher resolution
      this.analyser.smoothingTimeConstant = 0.5;
      
      const source = ctx.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      let isReceiving = false;
      let receivedText = '';
      let lastFrequency = 0;
      let lastFrequencyTime = Date.now();

      const analyze = () => {
        this.analyser!.getByteFrequencyData(dataArray);
        
        let maxValue = 0;
        let maxIndex = 0;
        for (let i = 0; i < bufferLength; i++) {
          if (dataArray[i] > maxValue) {
            maxValue = dataArray[i];
            maxIndex = i;
          }
        }

        const dominantFrequency = (maxIndex * ctx.sampleRate) / this.analyser!.fftSize;

        if (maxValue > SIGNAL_THRESHOLD) {
          if (Math.abs(dominantFrequency - START_MARKER_FREQ) < FREQUENCY_TOLERANCE) {
            isReceiving = true;
            receivedText = '';
          } else if (Math.abs(dominantFrequency - END_MARKER_FREQ) < FREQUENCY_TOLERANCE) {
            isReceiving = false;
            if (receivedText) {
              this.decoder$.next(receivedText);
            }
          } else if (isReceiving && Math.abs(dominantFrequency - lastFrequency) > FREQUENCY_TOLERANCE) {
            const now = Date.now();
            if (now - lastFrequencyTime > (CHAR_DURATION * 1000 * 0.8)) {
              const char = this.frequencyToChar(dominantFrequency);
              if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
                receivedText += char;
                lastFrequency = dominantFrequency;
                lastFrequencyTime = now;
              }
            }
          }
        }

        if (this.mediaStream) {
          requestAnimationFrame(analyze);
        }
      };

      analyze();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  public stopListening(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.analyser = null;
  }

  public onDecode() {
    return this.decoder$.asObservable();
  }
}