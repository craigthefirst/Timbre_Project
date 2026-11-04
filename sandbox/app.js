/**
 * @file app.js
 * @description Application controller for the Timbre Space Sandbox.
 * Manages user interface events, canvas visualization (FFT & Oscilloscope),
 * slider parameter tracking, Inspector vs. Participant Simulation modes,
 * 30-second trial countdown, and Likert psychometric ratings.
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = new window.TimbreAudioEngine();

  // DOM Elements
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const presetMelodyBtn = document.getElementById('presetMelodyBtn');
  const resetBaselineBtn = document.getElementById('resetBaselineBtn');
  const corruptionSelect = document.getElementById('corruptionSelect');
  const timbreSlider = document.getElementById('timbreSlider');
  const sliderReadout = document.getElementById('sliderReadout');
  const sliderTitle = document.getElementById('sliderTitle');
  const volumeSlider = document.getElementById('volumeSlider');
  const sliceSlider = document.getElementById('sliceSlider');
  const sliceTimeLabel = document.getElementById('sliceTimeLabel');
  const sliceControlTitle = document.getElementById('sliceControlTitle');
  const loopProgressBar = document.getElementById('loopProgressBar');
  const playback5sBtn = document.getElementById('playback5sBtn');
  const playbackFullBtn = document.getElementById('playbackFullBtn');
  const loopBadgeBtn = document.getElementById('loopBadgeBtn');
  const trackTimeDisplay = document.getElementById('trackTimeDisplay');
  const modeInspectorBtn = document.getElementById('modeInspectorBtn');
  const modeSimulationBtn = document.getElementById('modeSimulationBtn');
  const simulationPanel = document.getElementById('simulationPanel');
  const inspectorPanel = document.getElementById('inspectorPanel');
  const startTrialBtn = document.getElementById('startTrialBtn');
  const submitTrialBtn = document.getElementById('submitTrialBtn');
  const timerDisplay = document.getElementById('timerDisplay');
  const timerProgressBar = document.getElementById('timerProgressBar');
  const ratingSection = document.getElementById('ratingSection');
  const resultBanner = document.getElementById('resultBanner');
  const exportLogBtn = document.getElementById('exportLogBtn');
  const centroidDisplay = document.getElementById('centroidDisplay');
  const exactLambdaInput = document.getElementById('exactLambdaInput');
  const minBoundInput = document.getElementById('minBoundInput');
  const maxBoundInput = document.getElementById('maxBoundInput');
  const applyBoundsBtn = document.getElementById('applyBoundsBtn');
  const sliderMinLabel = document.getElementById('sliderMinLabel');
  const sliderMaxLabel = document.getElementById('sliderMaxLabel');
  const baselineIndicator = document.getElementById('baselineIndicator');
  const canvas = document.getElementById('visualizerCanvas');
  const canvasCtx = canvas.getContext('2d');

  // Application State
  let currentMode = 'inspector'; // 'inspector' | 'simulation'
  let simulationActive = false;
  let trialTimerId = null;
  let isUserDraggingScrubber = false;

  /**
   * Format a duration in seconds into a standard mm:ss timestamp string.
   * @param {number} sec Time in seconds.
   * @returns {string} Formatted timestamp string.
   */
  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  /**
   * Configure the playback mode UI and audio engine (5s Loop vs Continuous Full Track).
   * @param {'5s_loop'|'full_track'} mode Target playback mode.
   */
  function setPlaybackModeUI(mode) {
    engine.setPlaybackMode(mode);
    const totalDuration = engine.rawBuffer ? engine.rawBuffer.duration : 5.0;

    if (mode === '5s_loop') {
      playback5sBtn.classList.add('btn-primary');
      playbackFullBtn.classList.remove('btn-primary');
      loopBadgeBtn.textContent = '🔁 5s LOOP';
      loopBadgeBtn.style.color = 'var(--accent-emerald)';
      sliceControlTitle.textContent = '5s Loop Window Position';
      sliceSlider.min = 0;
      sliceSlider.max = Math.max(0, totalDuration - 5.0);
      sliceSlider.step = 0.1;
      sliceSlider.value = engine.sliceStartTime;
      sliceTimeLabel.textContent = `${engine.sliceStartTime.toFixed(1)}s - ${(engine.sliceStartTime + 5.0).toFixed(1)}s (of ${totalDuration.toFixed(1)}s)`;
    } else {
      playbackFullBtn.classList.add('btn-primary');
      playback5sBtn.classList.remove('btn-primary');
      loopBadgeBtn.textContent = '▶ FULL TRACK';
      loopBadgeBtn.style.color = 'var(--accent-cyan)';
      sliceControlTitle.textContent = 'Track Seek & Position';
      sliceSlider.min = 0;
      sliceSlider.max = totalDuration;
      sliceSlider.step = 0.25;
      sliceSlider.value = engine.trackPlaybackOffset;
      sliceTimeLabel.textContent = `${formatTime(engine.trackPlaybackOffset)} / ${formatTime(totalDuration)}`;
    }
  }
  let trialRemainingSeconds = 30;
  const trialTotalSeconds = 30;
  let trialStartTimestamp = 0;
  let groundTruthZeroOffset = 0.0; // In simulation mode, slider position that restores uncorrupted
  let trialLogs = [];
  let userEnjoymentRating = null;
  let userFamiliarityRating = null;

  /**
   * Resize canvas for sharp rendering on retina / high-DPI displays.
   */
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvasCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  /**
   * Update the audio play/pause button icon and state.
   */
  function updatePlayButtonUI() {
    if (engine.isPlaying) {
      playIcon.textContent = '⏸';
      playBtn.setAttribute('title', 'Pause Audio');
    } else {
      playIcon.textContent = '▶';
      const modeText = engine.playbackMode === '5s_loop' ? '5s Loop' : 'Continuous Track';
      playBtn.setAttribute('title', `Play Audio (${modeText})`);
    }
  }

  /**
   * Handle audio file selection and decoding.
   * @param {File} file Uploaded audio file.
   */
  async function handleAudioUpload(file) {
    try {
      dropzone.querySelector('p').innerHTML = `Decoding <strong>${file.name}</strong>...`;
      await engine.loadAudioFile(file);
      dropzone.querySelector('p').innerHTML = `Loaded: <strong>${file.name}</strong> (${engine.rawBuffer.duration.toFixed(1)}s)`;
      setPlaybackModeUI(engine.playbackMode);
      await engine.play();
      updatePlayButtonUI();
    } catch (err) {
      console.error('Audio loading error:', err);
      alert(`Error loading audio file: ${err.message}`);
    }
  }

  /**
   * Handle loading an acoustic instrument preset from an audio asset URL.
   * @param {string} url Relative URL path to sample audio file.
   * @param {string} instrumentName Display name of the instrument.
   */
  async function handleAudioPresetUrl(url, instrumentName) {
    try {
      dropzone.querySelector('p').innerHTML = `Loading <strong>${instrumentName}</strong>...`;
      await engine.loadAudioFromUrl(url);
      dropzone.querySelector('p').innerHTML = `Loaded: <strong>${instrumentName}</strong> (${engine.rawBuffer.duration.toFixed(1)}s)`;
      setPlaybackModeUI(engine.playbackMode);
      await engine.play();
      updatePlayButtonUI();
    } catch (err) {
      console.error('Error loading preset audio:', err);
      alert(`Could not load instrument preset: ${err.message}`);
    }
  }

  // Instrument Preset Buttons
  document.querySelectorAll('.instrument-preset-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const targetBtn = e.currentTarget;
      const url = targetBtn.dataset.url;
      const name = targetBtn.dataset.name;
      document.querySelectorAll('.instrument-preset-btn').forEach(b => b.classList.remove('btn-primary'));
      targetBtn.classList.add('btn-primary');
      await handleAudioPresetUrl(url, name);
    });
  });

  // File Dropzone Listeners
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleAudioUpload(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleAudioUpload(e.dataTransfer.files[0]);
    }
  });

  // Preset Melody Generation Button
  presetMelodyBtn.addEventListener('click', async () => {
    presetMelodyBtn.disabled = true;
    presetMelodyBtn.textContent = 'Synthesizing...';
    try {
      await engine.generatePresetMelody();
      dropzone.querySelector('p').innerHTML = `Loaded: <strong>Synthesized 5s Harmonic Motif (C Major)</strong>`;
      setPlaybackModeUI(engine.playbackMode);
      await engine.play();
      updatePlayButtonUI();
    } finally {
      presetMelodyBtn.disabled = false;
      presetMelodyBtn.textContent = '🎵 Load Preset 5s Melody';
    }
  });

  // Playback Mode Buttons & Badges
  playback5sBtn.addEventListener('click', () => setPlaybackModeUI('5s_loop'));
  playbackFullBtn.addEventListener('click', () => setPlaybackModeUI('full_track'));
  loopBadgeBtn.addEventListener('click', () => {
    setPlaybackModeUI(engine.playbackMode === '5s_loop' ? 'full_track' : '5s_loop');
  });

  // Playback & Volume Controls
  playBtn.addEventListener('click', () => {
    engine.togglePlay();
    updatePlayButtonUI();
  });

  volumeSlider.addEventListener('input', (e) => {
    engine.setMasterVolume(parseFloat(e.target.value));
  });

  // Scrubber & Seeking
  sliceSlider.addEventListener('mousedown', () => { isUserDraggingScrubber = true; });
  sliceSlider.addEventListener('touchstart', () => { isUserDraggingScrubber = true; });
  window.addEventListener('mouseup', () => { isUserDraggingScrubber = false; });
  window.addEventListener('touchend', () => { isUserDraggingScrubber = false; });

  sliceSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    const totalDuration = engine.rawBuffer ? engine.rawBuffer.duration : 5.0;
    if (engine.playbackMode === '5s_loop') {
      engine.setSliceStartTime(val);
      sliceTimeLabel.textContent = `${val.toFixed(1)}s - ${(val + 5.0).toFixed(1)}s (of ${totalDuration.toFixed(1)}s)`;
    } else {
      engine.seekTrack(val);
      sliceTimeLabel.textContent = `${formatTime(val)} / ${formatTime(totalDuration)}`;
    }
  });

  const progressBarContainer = document.getElementById('progressBarContainer');
  if (progressBarContainer) {
    progressBarContainer.addEventListener('click', (e) => {
      if (engine.rawBuffer) {
        const rect = progressBarContainer.getBoundingClientRect();
        const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const duration = engine.playbackMode === '5s_loop' ? (engine.activeSliceBuffer ? engine.activeSliceBuffer.duration : 5.0) : engine.rawBuffer.duration;
        const targetTime = clickRatio * duration;
        if (engine.playbackMode === 'full_track') {
          engine.seekTrack(targetTime);
          sliceSlider.value = targetTime;
          sliceTimeLabel.textContent = `${formatTime(targetTime)} / ${formatTime(duration)}`;
        }
      }
    });
  }

  engine.onPlaybackEnd = () => {
    updatePlayButtonUI();
    loopProgressBar.style.width = '0%';
    if (trackTimeDisplay) {
      trackTimeDisplay.textContent = `0:00 / ${formatTime(engine.rawBuffer ? engine.rawBuffer.duration : 0)}`;
    }
  };

  engine.onProgressUpdate = (elapsed, duration, mode) => {
    const percent = duration > 0 ? (elapsed / duration) * 100 : 0;
    loopProgressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;

    if (trackTimeDisplay) {
      trackTimeDisplay.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    }

    if (mode === 'full_track' && !isUserDraggingScrubber) {
      sliceSlider.value = elapsed;
      sliceTimeLabel.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
    }
  };

  // Corruption Function Selector
  corruptionSelect.addEventListener('change', (e) => {
    engine.setCorruptionType(e.target.value);
    updateSliderLabel();
  });

  /**
   * Update the label text of the 1D slider according to the selected corruption type.
   */
  function updateSliderLabel() {
    const type = corruptionSelect.value;
    switch (type) {
      case 'stretching':
        sliderTitle.textContent = 'Harmonic Stretching (Inharmonicity / Roughness)';
        break;
      case 'scrunching':
        sliderTitle.textContent = 'Harmonic Scrunching (Partial Compression)';
        break;
      case 'raising':
        sliderTitle.textContent = 'Spectral Tilt (Centroid Raising / Brightness)';
        break;
      case 'odd_even':
        sliderTitle.textContent = 'Odd / Even Harmonic Balance (Character)';
        break;
      default:
        sliderTitle.textContent = 'Harmonic Transformation (λ)';
    }
  }

  /**
   * Set and configure the continuous slider bounds [minVal, maxVal].
   * Dynamically adjusts step size, UI tick labels, and baseline position.
   * @param {number} minVal Minimum scalar bound for lambda.
   * @param {number} maxVal Maximum scalar bound for lambda.
   */
  function updateSliderBounds(minVal, maxVal) {
    if (isNaN(minVal) || isNaN(maxVal) || minVal >= maxVal) {
      alert('Invalid bounds: Minimum bound must be strictly less than maximum bound.');
      return;
    }

    timbreSlider.min = minVal;
    timbreSlider.max = maxVal;
    timbreSlider.step = Math.max(0.001, (maxVal - minVal) / 1000);

    minBoundInput.value = minVal;
    maxBoundInput.value = maxVal;

    sliderMinLabel.textContent = `${minVal >= 0 ? '+' : ''}${minVal.toFixed(1)}`;
    sliderMaxLabel.textContent = `${maxVal >= 0 ? '+' : ''}${maxVal.toFixed(1)}`;

    if (minVal <= 0 && maxVal >= 0) {
      baselineIndicator.style.display = 'inline';
      baselineIndicator.textContent = '▲ 0.0 (Uncorrupted)';
    } else {
      baselineIndicator.style.display = 'none';
    }
  }

  // Slider Bounds Toolbar Event Listeners
  applyBoundsBtn.addEventListener('click', () => {
    const minVal = parseFloat(minBoundInput.value);
    const maxVal = parseFloat(maxBoundInput.value);
    updateSliderBounds(minVal, maxVal);
  });

  document.querySelectorAll('.bound-preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const minVal = parseFloat(e.target.dataset.min);
      const maxVal = parseFloat(e.target.dataset.max);
      updateSliderBounds(minVal, maxVal);
    });
  });

  // Direct Exact Lambda Input Listener
  exactLambdaInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      const curMin = parseFloat(timbreSlider.min);
      const curMax = parseFloat(timbreSlider.max);
      if (val < curMin) {
        updateSliderBounds(val - 1.0, curMax);
      } else if (val > curMax) {
        updateSliderBounds(curMin, val + 1.0);
      }
      timbreSlider.value = val;
      handleSliderChange(val);
    }
  });

  // 1D Continuous Slider Interaction
  timbreSlider.addEventListener('input', (e) => {
    const sliderVal = parseFloat(e.target.value);
    handleSliderChange(sliderVal);
  });

  /**
   * Process a change on the 1D continuous slider.
   * In Inspector mode, slider maps directly to lambda in R.
   * In Simulation mode, slider maps relative to the randomized ground truth offset.
   * @param {number} sliderVal Raw value of the UI slider in [min, max].
   */
  function handleSliderChange(sliderVal) {
    if (exactLambdaInput && document.activeElement !== exactLambdaInput) {
      exactLambdaInput.value = sliderVal.toFixed(3);
    }

    if (currentMode === 'inspector') {
      engine.applyContinuousTransformation(sliderVal);
      sliderReadout.textContent = `λ = ${sliderVal >= 0 ? '+' : ''}${sliderVal.toFixed(3)}`;
      if (Math.abs(sliderVal) < 1e-4) {
        sliderReadout.style.color = 'var(--accent-emerald)';
      } else {
        sliderReadout.style.color = 'var(--accent-cyan)';
      }
    } else {
      // Simulation mode: user perceives slider position, but underlying lambda is offset
      const effectiveLambda = sliderVal - groundTruthZeroOffset;
      engine.applyContinuousTransformation(effectiveLambda);
      sliderReadout.textContent = 'Transforming...';
      sliderReadout.style.color = 'var(--accent-amber)';
    }
  }

  // Reset to Uncorrupted Baseline
  resetBaselineBtn.addEventListener('click', () => {
    timbreSlider.value = 0.0;
    handleSliderChange(0.0);
  });

  // Mode Switchers
  modeInspectorBtn.addEventListener('click', () => setMode('inspector'));
  modeSimulationBtn.addEventListener('click', () => setMode('simulation'));

  /**
   * Switch between Inspector Mode and Participant Simulation Mode.
   * @param {'inspector'|'simulation'} mode Target mode.
   */
  function setMode(mode) {
    currentMode = mode;
    const boundsToolbar = document.getElementById('sliderBoundsToolbar');
    if (mode === 'inspector') {
      modeInspectorBtn.classList.add('active');
      modeSimulationBtn.classList.remove('active');
      inspectorPanel.style.display = 'block';
      simulationPanel.style.display = 'none';
      sliderReadout.style.display = 'block';
      resetBaselineBtn.style.display = 'inline-flex';
      if (exactLambdaInput) exactLambdaInput.parentElement.style.display = 'flex';
      if (boundsToolbar) boundsToolbar.style.display = 'flex';
      stopTrial();
      handleSliderChange(parseFloat(timbreSlider.value));
    } else {
      modeSimulationBtn.classList.add('active');
      modeInspectorBtn.classList.remove('active');
      inspectorPanel.style.display = 'none';
      simulationPanel.style.display = 'block';
      resetBaselineBtn.style.display = 'none';
      if (exactLambdaInput) exactLambdaInput.parentElement.style.display = 'none';
      if (boundsToolbar) boundsToolbar.style.display = 'none';
      stopTrial();
    }
  }

  // Participant Simulation Trial Flow
  startTrialBtn.addEventListener('click', startTrial);
  submitTrialBtn.addEventListener('click', endTrial);

  /**
   * Start a randomized 30-second trial simulating a research participant session.
   */
  async function startTrial() {
    if (!engine.activeSliceBuffer) {
      await engine.generatePresetMelody();
      updatePlayButtonUI();
    }

    simulationActive = true;
    startTrialBtn.style.display = 'none';
    submitTrialBtn.style.display = 'inline-flex';
    ratingSection.classList.remove('active');
    resultBanner.classList.remove('show');
    userEnjoymentRating = null;
    userFamiliarityRating = null;
    document.querySelectorAll('.likert-btn').forEach(b => b.classList.remove('selected'));

    // Randomize initial corruption offset in [-0.75, +0.75] away from 0
    const sign = Math.random() < 0.5 ? -1 : 1;
    groundTruthZeroOffset = sign * (0.25 + Math.random() * 0.5); // Where user needs to move slider to reach uncorrupted
    timbreSlider.value = 0.0; // Start at center position

    // Apply starting corruption
    handleSliderChange(0.0);

    // Ensure audio is in 5-second loop mode for participant trial
    setPlaybackModeUI('5s_loop');

    // Ensure audio is actively playing in continuous loop
    if (!engine.isPlaying) {
      await engine.play();
      updatePlayButtonUI();
    }

    // Initialize 30s countdown timer
    trialRemainingSeconds = trialTotalSeconds;
    trialStartTimestamp = performance.now();
    updateTimerUI();

    if (trialTimerId) clearInterval(trialTimerId);
    trialTimerId = setInterval(() => {
      trialRemainingSeconds -= 0.1;
      if (trialRemainingSeconds <= 0) {
        trialRemainingSeconds = 0;
        updateTimerUI();
        endTrial();
      } else {
        updateTimerUI();
      }
    }, 100);
  }

  /**
   * Update the countdown timer display and progress bar.
   */
  function updateTimerUI() {
    timerDisplay.textContent = `${Math.ceil(trialRemainingSeconds)}s`;
    const percent = (trialRemainingSeconds / trialTotalSeconds) * 100;
    timerProgressBar.style.width = `${percent}%`;
  }

  /**
   * Complete the trial and open the Likert evaluation questionnaire.
   */
  function endTrial() {
    if (!simulationActive) return;
    simulationActive = false;
    clearInterval(trialTimerId);
    trialTimerId = null;

    const timeSpent = ((performance.now() - trialStartTimestamp) / 1000).toFixed(1);
    const finalSliderPos = parseFloat(timbreSlider.value);
    const effectiveFinalLambda = finalSliderPos - groundTruthZeroOffset;
    const errorFromUncorrupted = Math.abs(effectiveFinalLambda).toFixed(3);

    submitTrialBtn.style.display = 'none';
    startTrialBtn.style.display = 'inline-flex';
    startTrialBtn.textContent = '🔄 Start Next Trial';

    // Show rating form
    ratingSection.classList.add('active');

    // Store trial context for logging
    window.currentTrialResult = {
      timestamp: new Date().toISOString(),
      corruptionType: corruptionSelect.value,
      groundTruthZeroOffset: groundTruthZeroOffset.toFixed(3),
      finalSliderPosition: finalSliderPos.toFixed(3),
      errorFromUncorrupted: errorFromUncorrupted,
      timeSpentSeconds: timeSpent,
    };
  }

  /**
   * Stop any active trial and clean up timer.
   */
  function stopTrial() {
    simulationActive = false;
    if (trialTimerId) {
      clearInterval(trialTimerId);
      trialTimerId = null;
    }
    startTrialBtn.style.display = 'inline-flex';
    submitTrialBtn.style.display = 'none';
  }

  // Likert Button Selection Listeners
  document.querySelectorAll('.likert-btn[data-group="enjoyment"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.likert-btn[data-group="enjoyment"]').forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
      userEnjoymentRating = parseInt(e.target.dataset.value);
      checkRatingsComplete();
    });
  });

  document.querySelectorAll('.likert-btn[data-group="familiarity"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.likert-btn[data-group="familiarity"]').forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
      userFamiliarityRating = parseInt(e.target.dataset.value);
      checkRatingsComplete();
    });
  });

  /**
   * Check if both Likert ratings have been submitted and finalize trial log.
   */
  function checkRatingsComplete() {
    if (userEnjoymentRating !== null && userFamiliarityRating !== null && window.currentTrialResult) {
      const logEntry = {
        ...window.currentTrialResult,
        enjoymentLikert: userEnjoymentRating,
        familiarityLikert: userFamiliarityRating,
      };
      trialLogs.push(logEntry);

      resultBanner.innerHTML = `
        <strong>Trial Logged!</strong> Reconstruction Error: <code>|λ - λ*| = ${logEntry.errorFromUncorrupted}</code> | 
        Time: <code>${logEntry.timeSpentSeconds}s</code> | 
        Enjoyment: <code>${logEntry.enjoymentLikert}/5</code> | 
        Familiarity: <code>${logEntry.familiarityLikert}/3</code>
      `;
      resultBanner.classList.add('show');
    }
  }

  // Export Trial Data to JSON
  exportLogBtn.addEventListener('click', () => {
    if (trialLogs.length === 0) {
      alert('No trial data recorded yet. Run a participant simulation trial first!');
      return;
    }
    const blob = new Blob([JSON.stringify(trialLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timbre_trials_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  /**
   * Real-Time Canvas Visualizer: Renders FFT Spectrum and Oscilloscope waveform.
   */
  function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);

    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;

    canvasCtx.fillStyle = '#050811';
    canvasCtx.fillRect(0, 0, width, height);

    if (!engine.analyser) {
      // Draw idle grid line
      canvasCtx.strokeStyle = '#1e293b';
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, height / 2);
      canvasCtx.lineTo(width, height / 2);
      canvasCtx.stroke();
      return;
    }

    const binCount = engine.analyser.frequencyBinCount;
    const freqData = new Uint8Array(binCount);
    const timeData = new Uint8Array(binCount);
    engine.analyser.getByteFrequencyData(freqData);
    engine.analyser.getByteTimeDomainData(timeData);

    // 1. Draw FFT Frequency Spectrum (Bars with Gradient)
    const barCount = 120;
    const barWidth = width / barCount;
    const gradient = canvasCtx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
    gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.8)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0.95)');
    canvasCtx.fillStyle = gradient;

    for (let i = 0; i < barCount; i++) {
      // Logarithmic frequency bin mapping for musical perception
      const binIdx = Math.floor(Math.pow(i / barCount, 2.0) * (binCount * 0.75));
      const val = freqData[binIdx] / 255.0;
      const barHeight = val * (height * 0.85);
      canvasCtx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }

    // 2. Draw Waveform Oscilloscope Overlay
    canvasCtx.lineWidth = 1.5;
    canvasCtx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    canvasCtx.beginPath();
    const sliceWidth = width / binCount;
    let x = 0;
    for (let i = 0; i < binCount; i++) {
      const v = timeData[i] / 128.0;
      const y = (v * (height / 2)) * 0.35 + (height * 0.25);
      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    canvasCtx.stroke();

    // 3. Update Real-Time Spectral Centroid Readout
    if (engine.isPlaying) {
      const centroid = engine.getRealtimeSpectralCentroid();
      centroidDisplay.textContent = `${Math.round(centroid)} Hz`;
    } else {
      centroidDisplay.textContent = '--- Hz';
    }
  }

  drawVisualizer();
});

