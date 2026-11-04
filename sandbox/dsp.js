/**
 * @file dsp.js
 * @description Web Audio DSP engine for real-time harmonic timbre manipulation and analysis.
 * Implements harmonic transformations (stretching, scrunching, spectral tilt, odd/even balance),
 * seamless 5-second audio looping, and real-time spectral feature extraction.
 */

class TimbreAudioEngine {
  /**
   * Initialize the Timbre Audio Engine.
   * Sets up AudioContext, DSP processing nodes, and default parameters.
   */
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;

    /** @type {AudioBuffer|null} Master uncorrupted audio buffer */
    this.rawBuffer = null;

    /** @type {AudioBuffer|null} Active 5-second sliced buffer */
    this.activeSliceBuffer = null;

    /** @type {AudioBufferSourceNode|null} Currently playing source node */
    this.sourceNode = null;

    /** @type {GainNode|null} Master volume gain node */
    this.masterGain = null;

    /** @type {AnalyserNode|null} Frequency and time-domain analyzer */
    this.analyser = null;

    /** @type {BiquadFilterNode|null} High-shelf filter for spectral tilt (raising) */
    this.highShelfFilter = null;

    /** @type {BiquadFilterNode|null} Low-shelf filter for spectral tilt */
    this.lowShelfFilter = null;

    /** @type {BiquadFilterNode[]} Array of peaking filters for harmonic odd/even balance */
    this.harmonicFilters = [];

    /** @type {BiquadFilterNode[]} Array of all-pass dispersion filters for harmonic stretching */
    this.dispersionFilters = [];

    // State variables
    this.isPlaying = false;
    this.isLooping = true;
    this.playbackMode = 'full_track'; // '5s_loop' | 'full_track'
    this.trackPlaybackOffset = 0.0;
    this.sliceStartTime = 0.0;
    this.sliceDuration = 5.0; // 5 seconds per proposal specification
    this.playbackStartTime = 0;
    this.currentCorruptionType = 'stretching';
    this.lambdaValue = 0.0; // 0.0 represents uncorrupted baseline
    this.baseFundamentalFreq = 261.63; // C4 default

    this.onProgressUpdate = null;
    this.onPlaybackEnd = null;
    this._animationFrameId = null;
  }

  /**
   * Lazily initialize and resume the Web Audio Context.
   * @returns {Promise<AudioContext>} The active audio context.
   */
  async ensureAudioContext() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Master output & analyzer
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.75;

      // Construct DSP Filter Chain
      this._buildDspFilterChain();

      // Connect DSP output to Master Gain -> Analyser -> Speakers
      this._lastDspNode.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Build the real-time DSP filter chain for continuous parameter transformations.
   * @private
   */
  _buildDspFilterChain() {
    // 1. Spectral Tilt Filters (High-shelf and Low-shelf pair)
    this.highShelfFilter = this.ctx.createBiquadFilter();
    this.highShelfFilter.type = 'highshelf';
    this.highShelfFilter.frequency.value = 1500;
    this.highShelfFilter.gain.value = 0;

    this.lowShelfFilter = this.ctx.createBiquadFilter();
    this.lowShelfFilter.type = 'lowshelf';
    this.lowShelfFilter.frequency.value = 600;
    this.lowShelfFilter.gain.value = 0;

    // 2. Harmonic Odd/Even Shaping Filters (Peaking filters centered at harmonics)
    this.harmonicFilters = [];
    const maxHarmonics = 12;
    for (let k = 1; k <= maxHarmonics; k++) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = this.baseFundamentalFreq * k;
      filter.Q.value = 6.0;
      filter.gain.value = 0;
      this.harmonicFilters.push(filter);
    }

    // 3. All-Pass Dispersion Filters for Harmonic Stretching & Inharmonicity
    // All-pass filters introduce frequency-dependent phase delay, warping harmonic spacing
    this.dispersionFilters = [];
    const dispersionCount = 6;
    for (let i = 0; i < dispersionCount; i++) {
      const apFilter = this.ctx.createBiquadFilter();
      apFilter.type = 'allpass';
      apFilter.frequency.value = 800 + i * 400;
      apFilter.Q.value = 2.0;
      this.dispersionFilters.push(apFilter);
    }

    // Connect in series: HighShelf -> LowShelf -> Harmonics -> Dispersion
    this._firstDspNode = this.highShelfFilter;
    this.highShelfFilter.connect(this.lowShelfFilter);

    let prevNode = this.lowShelfFilter;
    for (const hf of this.harmonicFilters) {
      prevNode.connect(hf);
      prevNode = hf;
    }

    for (const df of this.dispersionFilters) {
      prevNode.connect(df);
      prevNode = df;
    }

    this._lastDspNode = prevNode;
  }

  /**
   * Set the master output volume.
   * @param {number} value Gain value between 0.0 and 1.0.
   */
  setMasterVolume(value) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Decode an uploaded audio File or Blob and load it into the engine.
   * @param {File|Blob} file Audio file to decode.
   * @returns {Promise<AudioBuffer>} Decoded audio buffer.
   */
  async loadAudioFile(file) {
    await this.ensureAudioContext();
    const arrayBuffer = await file.arrayBuffer();
    const decodedBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.rawBuffer = decodedBuffer;
    this.trackPlaybackOffset = 0.0;
    this.sliceStartTime = 0.0;
    this._updateSliceBuffer();
    return this.rawBuffer;
  }

  /**
   * Fetch an audio file from a relative or absolute URL, decode it, and load it into the engine.
   * @param {string} url Target URL of the audio asset.
   * @returns {Promise<AudioBuffer>} Decoded audio buffer.
   */
  async loadAudioFromUrl(url) {
    await this.ensureAudioContext();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load audio asset (${url}): HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const decodedBuffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.rawBuffer = decodedBuffer;
    this.trackPlaybackOffset = 0.0;
    this.sliceStartTime = 0.0;
    this._updateSliceBuffer();
    return this.rawBuffer;
  }

  /**
   * Generate an in-memory 5-second musical melody clip with rich harmonic spectra.
   * Useful for immediate testing without external files.
   * @returns {Promise<AudioBuffer>} Synthesized 5-second audio buffer.
   */
  async generatePresetMelody() {
    await this.ensureAudioContext();
    const sampleRate = this.ctx.sampleRate;
    const duration = 5.0;
    const totalSamples = Math.floor(sampleRate * duration);
    const audioBuffer = this.ctx.createBuffer(1, totalSamples, sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    // Sequence of notes in C major (C4, E4, G4, A4, B4, C5, G4, E4)
    const baseFreq = 261.63;
    const noteRatios = [1.0, 1.25, 1.5, 1.667, 1.875, 2.0, 1.5, 1.25];
    const noteDuration = duration / noteRatios.length;
    const samplesPerNote = Math.floor(noteDuration * sampleRate);

    for (let n = 0; n < noteRatios.length; n++) {
      const f0 = baseFreq * noteRatios[n];
      const startSample = n * samplesPerNote;
      const endSample = Math.min(startSample + samplesPerNote, totalSamples);

      for (let s = startSample; s < endSample; s++) {
        const t = (s - startSample) / sampleRate;
        let sampleVal = 0.0;

        // Generate 12 harmonic partials with 1/k falloff
        for (let k = 1; k <= 12; k++) {
          const harmonicFreq = k * f0;
          if (harmonicFreq >= sampleRate / 2) break;
          const amp = 1.0 / Math.pow(k, 0.85);
          sampleVal += amp * Math.sin(2 * Math.PI * harmonicFreq * t);
        }

        // Apply ADSR amplitude envelope to each note
        const noteProgress = (s - startSample) / samplesPerNote;
        let env = 1.0;
        if (noteProgress < 0.05) {
          env = noteProgress / 0.05; // Attack
        } else if (noteProgress > 0.85) {
          env = (1.0 - noteProgress) / 0.15; // Release
        }
        channelData[s] = sampleVal * env * 0.15;
      }
    }

    // Apply loop crossfade at the boundaries
    const crossfadeSamples = Math.floor(sampleRate * 0.04);
    for (let i = 0; i < crossfadeSamples; i++) {
      const fade = i / crossfadeSamples;
      channelData[i] *= fade;
      channelData[totalSamples - 1 - i] *= fade;
    }

    this.rawBuffer = audioBuffer;
    this.trackPlaybackOffset = 0.0;
    this.sliceStartTime = 0.0;
    this._updateSliceBuffer();
    return this.rawBuffer;
  }

  /**
   * Extract a 5-second slice from the loaded raw audio buffer.
   * @param {number} [startTime=0] Start offset in seconds.
   * @private
   */
  _updateSliceBuffer(startTime = this.sliceStartTime) {
    if (!this.rawBuffer || !this.ctx) return;

    this.sliceStartTime = Math.max(0, Math.min(startTime, Math.max(0, this.rawBuffer.duration - this.sliceDuration)));
    const sampleRate = this.rawBuffer.sampleRate;
    const startSample = Math.floor(this.sliceStartTime * sampleRate);
    const sliceLen = Math.floor(Math.min(this.sliceDuration, this.rawBuffer.duration) * sampleRate);

    const sliceBuffer = this.ctx.createBuffer(this.rawBuffer.numberOfChannels, sliceLen, sampleRate);

    for (let ch = 0; ch < this.rawBuffer.numberOfChannels; ch++) {
      const rawData = this.rawBuffer.getChannelData(ch);
      const sliceData = sliceBuffer.getChannelData(ch);
      const copyLen = Math.min(sliceLen, rawData.length - startSample);
      sliceData.set(rawData.subarray(startSample, startSample + copyLen));

      // Gentle boundary crossfade to guarantee clickless looping
      const fadeLen = Math.min(Math.floor(sampleRate * 0.02), Math.floor(sliceLen / 10));
      for (let i = 0; i < fadeLen; i++) {
        sliceData[i] *= (i / fadeLen);
        sliceData[sliceLen - 1 - i] *= (i / fadeLen);
      }
    }

    this.activeSliceBuffer = sliceBuffer;

    // If already playing in 5s_loop mode, restart loop with the new slice
    if (this.isPlaying && this.playbackMode === '5s_loop') {
      this.play();
    }
  }

  /**
   * Set the starting point in seconds for the 5-second slice.
   * @param {number} startTime Offset in seconds.
   */
  setSliceStartTime(startTime) {
    this._updateSliceBuffer(startTime);
  }

  /**
   * Set playback mode to either continuous 5-second loop ('5s_loop') or continuous full-track playback ('full_track').
   * @param {'5s_loop'|'full_track'} mode Playback mode string.
   */
  setPlaybackMode(mode) {
    if (mode !== '5s_loop' && mode !== 'full_track') return;
    if (this.playbackMode === mode) return;

    this.playbackMode = mode;
    if (this.isPlaying) {
      this.play();
    }
  }

  /**
   * Seek playback to a specific offset in seconds for full-track mode.
   * @param {number} seconds Target timestamp in seconds.
   */
  seekTrack(seconds) {
    if (!this.rawBuffer) return;
    this.trackPlaybackOffset = Math.max(0, Math.min(seconds, this.rawBuffer.duration - 0.05));
    if (this.isPlaying && this.playbackMode === 'full_track') {
      this.play();
    }
  }

  /**
   * Set the active corruption function type.
   * @param {'stretching'|'scrunching'|'raising'|'odd_even'} type Corruption type name.
   */
  setCorruptionType(type) {
    this.currentCorruptionType = type;
    this.applyContinuousTransformation(this.lambdaValue);
  }

  /**
   * Apply the continuous scalar transformation (lambda) to the real-time DSP filter graph.
   * Supports any real number lambda in (-inf, +inf). When lambda = 0, the audio returns strictly
   * to its uncorrupted state. Safe bounds are applied to filter frequencies and gains.
   * @param {number} lambda Continuous scalar parameter in R.
   */
  applyContinuousTransformation(lambda) {
    this.lambdaValue = lambda;
    if (!this.ctx) return;

    const time = this.ctx.currentTime;
    const rampTime = 0.03; // Smooth 30ms ramp prevents audible zipper noise
    const maxFreq = (this.ctx.sampleRate / 2) - 200;

    // Reset all DSP parameters to neutral state first
    this.highShelfFilter.gain.setTargetAtTime(0, time, rampTime);
    this.lowShelfFilter.gain.setTargetAtTime(0, time, rampTime);

    for (const hf of this.harmonicFilters) {
      hf.gain.setTargetAtTime(0, time, rampTime);
      hf.frequency.setTargetAtTime(this.baseFundamentalFreq, time, rampTime);
    }
    for (const df of this.dispersionFilters) {
      df.frequency.setTargetAtTime(800, time, rampTime);
      df.Q.setTargetAtTime(0.001, time, rampTime); // Near bypass
    }

    if (Math.abs(lambda) < 1e-4) {
      // Exactly uncorrupted baseline!
      return;
    }

    // Apply specific transformation across arbitrary real scalar lambda
    switch (this.currentCorruptionType) {
      case 'raising':
      case 'spectral_tilt': {
        // High-frequency shelf boost/cut; inverse low-shelf to tilt spectrum around 1kHz
        // Scale smoothly with lambda, clamped to safe hearing threshold [-40 dB, +40 dB]
        const shelfGain = Math.max(-40.0, Math.min(40.0, lambda * 12.0));
        this.highShelfFilter.gain.setTargetAtTime(shelfGain, time, rampTime);
        this.lowShelfFilter.gain.setTargetAtTime(-shelfGain * 0.5, time, rampTime);
        break;
      }

      case 'odd_even': {
        // Modulate odd vs even harmonics
        // Positive lambda: boost odd (1, 3, 5...), cut even (2, 4, 6...)
        // Negative lambda: boost even, cut odd
        for (let i = 0; i < this.harmonicFilters.length; i++) {
          const harmonicNum = i + 1;
          const isEven = (harmonicNum % 2 === 0);
          const filterGain = isEven ? (-lambda * 12.0) : (lambda * 12.0);
          const clampedGain = Math.max(-36.0, Math.min(24.0, filterGain));
          this.harmonicFilters[i].gain.setTargetAtTime(clampedGain, time, rampTime);
        }
        break;
      }

      case 'stretching': {
        // Harmonic Stretching & Inharmonicity (stiff-string dispersion):
        // Activate dispersion allpass network to skew phase and harmonic intervals
        const dispersionStrength = Math.abs(lambda);
        for (let i = 0; i < this.dispersionFilters.length; i++) {
          const targetQ = Math.min(18.0, 0.1 + dispersionStrength * 4.0);
          const targetFreq = Math.max(60, Math.min(maxFreq, 400 + i * (600 + lambda * 250)));
          this.dispersionFilters[i].Q.setTargetAtTime(targetQ, time, rampTime);
          this.dispersionFilters[i].frequency.setTargetAtTime(targetFreq, time, rampTime);
        }
        // Slightly detune harmonic band filters to simulate inharmonic partial drift
        for (let i = 0; i < this.harmonicFilters.length; i++) {
          const k = i + 1;
          const detuneShift = lambda * Math.pow(k, 1.8) * 10.0;
          const targetHk = Math.max(20, Math.min(maxFreq, this.baseFundamentalFreq * k + detuneShift));
          this.harmonicFilters[i].frequency.setTargetAtTime(targetHk, time, rampTime);
          const hGain = Math.max(-24.0, Math.min(24.0, lambda * 6.0));
          this.harmonicFilters[i].gain.setTargetAtTime(hGain, time, rampTime);
        }
        break;
      }

      case 'scrunching': {
        // Harmonic Scrunching: compress partial spacing inward towards fundamental
        for (let i = 0; i < this.harmonicFilters.length; i++) {
          const k = i + 1;
          // Partials compress inward towards f0 with arbitrary lambda
          const factor = Math.max(0.05, 1.0 - lambda * 0.3);
          const scrunchedFreq = this.baseFundamentalFreq + (k - 1) * this.baseFundamentalFreq * factor;
          const targetFreq = Math.max(20, Math.min(maxFreq, scrunchedFreq));
          this.harmonicFilters[i].frequency.setTargetAtTime(targetFreq, time, rampTime);
          const sGain = Math.max(-24.0, Math.min(24.0, lambda * 6.0));
          this.harmonicFilters[i].gain.setTargetAtTime(sGain, time, rampTime);
        }
        break;
      }
    }
  }

  /**
   * Start playback of audio in either continuous 5-second loop mode or continuous full-track mode.
   * @returns {Promise<void>}
   */
  async play() {
    await this.ensureAudioContext();
    if (!this.rawBuffer) return;

    // Stop active node cleanly without resetting trackPlaybackOffset
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {
        // Node may have already ended
      }
      this.sourceNode = null;
    }

    this.sourceNode = this.ctx.createBufferSource();

    if (this.playbackMode === '5s_loop') {
      if (!this.activeSliceBuffer) {
        this._updateSliceBuffer();
      }
      this.sourceNode.buffer = this.activeSliceBuffer;
      this.sourceNode.loop = this.isLooping;
      this.sourceNode.loopStart = 0;
      this.sourceNode.loopEnd = this.activeSliceBuffer.duration;
      this.sourceNode.connect(this._firstDspNode);

      this.playbackStartTime = this.ctx.currentTime;
      this.sourceNode.start(0);
    } else {
      // Full-track continuous playback mode
      this.sourceNode.buffer = this.rawBuffer;
      this.sourceNode.loop = false;
      this.sourceNode.connect(this._firstDspNode);

      const offset = Math.max(0, Math.min(this.trackPlaybackOffset, this.rawBuffer.duration - 0.05));
      this.playbackStartTime = this.ctx.currentTime;
      this.trackPlaybackOffset = offset;
      this.sourceNode.start(0, offset);

      this.sourceNode.onended = () => {
        if (this.isPlaying && this.playbackMode === 'full_track') {
          const elapsed = (this.ctx.currentTime - this.playbackStartTime) + this.trackPlaybackOffset;
          if (elapsed >= this.rawBuffer.duration - 0.15) {
            this.isPlaying = false;
            this.trackPlaybackOffset = 0.0;
            this._stopProgressTracker();
            if (this.onPlaybackEnd) this.onPlaybackEnd();
          }
        }
      };
    }

    this.isPlaying = true;
    this._startProgressTracker();
  }

  /**
   * Stop active audio playback and record position if in full track mode.
   */
  stop() {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {
        // Node may have already ended
      }
      this.sourceNode = null;
    }

    if (this.isPlaying && this.playbackMode === 'full_track' && this.ctx && this.rawBuffer) {
      const elapsedSinceStart = this.ctx.currentTime - this.playbackStartTime;
      this.trackPlaybackOffset = Math.min(this.rawBuffer.duration, this.trackPlaybackOffset + elapsedSinceStart);
    }

    this.isPlaying = false;
    this._stopProgressTracker();
  }

  /**
   * Toggle between play and pause.
   */
  togglePlay() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.play();
    }
  }

  /**
   * Start loop or track progress tracking animation.
   * @private
   */
  _startProgressTracker() {
    this._stopProgressTracker();
    const update = () => {
      if (this.isPlaying && this.ctx) {
        let elapsed = 0;
        let duration = 5.0;

        if (this.playbackMode === '5s_loop' && this.activeSliceBuffer) {
          duration = this.activeSliceBuffer.duration;
          elapsed = (this.ctx.currentTime - this.playbackStartTime) % duration;
        } else if (this.playbackMode === 'full_track' && this.rawBuffer) {
          duration = this.rawBuffer.duration;
          elapsed = (this.ctx.currentTime - this.playbackStartTime) + this.trackPlaybackOffset;
          if (elapsed > duration) elapsed = duration;
        }

        if (this.onProgressUpdate) {
          this.onProgressUpdate(elapsed, duration, this.playbackMode);
        }
        this._animationFrameId = requestAnimationFrame(update);
      }
    };
    this._animationFrameId = requestAnimationFrame(update);
  }

  /**
   * Stop loop progress tracking animation.
   * @private
   */
  _stopProgressTracker() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  /**
   * Calculate the real-time spectral centroid (in Hz) from the current analyser frame.
   * @returns {number} Spectral centroid in Hertz.
   */
  getRealtimeSpectralCentroid() {
    if (!this.analyser || !this.ctx) return 0;

    const binCount = this.analyser.frequencyBinCount;
    const freqData = new Float32Array(binCount);
    this.analyser.getFloatFrequencyData(freqData);

    const nyquist = this.ctx.sampleRate / 2;
    let weightedSum = 0;
    let totalMagnitude = 0;

    for (let i = 0; i < binCount; i++) {
      // Convert dB to linear amplitude
      const mag = Math.pow(10, freqData[i] / 20);
      const freq = (i / binCount) * nyquist;
      weightedSum += freq * mag;
      totalMagnitude += mag;
    }

    return totalMagnitude > 1e-6 ? (weightedSum / totalMagnitude) : 0;
  }
}

// Export for global browser use
window.TimbreAudioEngine = TimbreAudioEngine;

