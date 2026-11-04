# Timbre Space Project: Mapping Timbre Space

## Overview
This repository contains the software, experimental protocols, and analysis pipelines for the research project:
**"Mapping Timbre Space: Can We Make More Beautiful Instruments?"**

The study investigates how controlled mathematical alterations to the harmonic spectra of musical melodies interact with auditory preferences, perceived roughness, harmonicity, and familiarity, aiming to model the geometry of high-dimensional timbre space.

---

## Key Experimental Specifications
- **Audio Stimuli**: 5-second continuous looping melody clips sampled across musical genres and eras.
- **Harmonic Corruption**: Deformations applied to audio harmonics (e.g., stretching, scrunching, raising).
- **Interactive Slider**: A 1-dimensional continuous slider that applies scalable transformations, with a specific position ($\lambda = 0$ or calibrated baseline) restoring the audio to its uncorrupted state.
- **Trial Procedure**: 30-second trial window where participants adjust the slider to maximize a target auditory quality, followed by enjoyment (5-point Likert) and familiarity (3-point) ratings, interspersed with psychometric palate cleansers (TIPI, PHQ-9, Dirty Dozen).
- **Modeling**: Predictive neural networks and gradient descent in timbre space to identify optimal timbral vectors.

---

## Current Progress
- [x] **Proposal Analysis & System Planning**: Formulated specifications from the Materials and Measures section and created detailed project architecture.
- [x] **Interactive Sandbox Application (`sandbox/`)**:
  - **Audio Engine**: Web Audio API DSP pipeline with seamless 5-second looping, master volume, and audio slice scrubber.
  - **Acoustic Instrument Presets**: Built-in 1-click loading of high-fidelity solo acoustic instrument recordings:
    - *Solo Cello*: J.S. Bach Cello Suite No. 1 in G major, Prélude (BWV 1007), performed by John Michel.
    - *Solo Violin*: J.S. Bach Partita No. 3 in E major, Preludio (BWV 1006).
    - *Concert Grand Piano*: J.S. Bach Goldberg Variations, Aria (BWV 988), performed by Kimiko Ishizaka on a Bösendorfer 290 Imperial (Open Goldberg Variations).
    - *Solo Silver Flute*: Claude Debussy, *Syrinx* (1913), performed by Sarah Bassingthwaite.
    - *Synthetic Motif*: Standardized reference tone (C Major arpeggio, 12 partials).
  - **Stimulus Ingestion**: Drag-and-drop file upload (WAV, MP3, FLAC, OGG) with automatic decoding.
  - **Harmonic Corruption Suite**:
    - *Harmonic Stretching*: Simulates acoustic stiff-string dispersion and inharmonicity ($f_k \approx k f_0 \sqrt{1 + B k^2}$).
    - *Harmonic Scrunching*: Compresses partial intervals inward toward the fundamental frequency.
    - *Spectral Tilt ("Raising")*: Modulates spectral centroid and high-frequency energy.
    - *Odd/Even Balance*: Alters ratio between odd and even harmonics (clarinet vs. open resonator).
  - **Dual Playback Modes (5s Loop vs Continuous Track)**:
    - *🔁 5s Loop Mode*: Continuously loops a 5-second excerpt with seamless boundary crossfades, simulating the experimental trial setup.
    - *▶ Continuous Track Mode*: Plays the full uploaded or preset piece from start to finish without 5-second looping, allowing evaluation of harmonic transformations across entire musical movements and changing registers.
    - Interactive seek bar, timestamp display (`mm:ss / mm:ss`), and click-to-seek progress bar.
  - **Arbitrary $\lambda \in \mathbb{R}$ & Configurable Slider Bounds**:
    - Full support for arbitrary real values $\lambda \in (-\infty, +\infty)$ without artificial $[-1, 1]$ constraints.
    - Custom Min and Max bound inputs with dynamic step adjustment.
    - Quick bound range presets ($\pm 1, \pm 2, \pm 5, \pm 10, [0, 5]$).
    - Direct numerical "Exact $\lambda$" input box with auto-expanding bounds.
    - Adaptive baseline indicator showing the precise location of uncorrupted $\lambda = 0$.
  - **Real-Time Visualizer**: Dual FFT frequency spectrum and oscilloscope waveform rendered on HTML5 Canvas with live spectral centroid readout.
  - **Dual Operating Modes**:
    - *Inspector Mode*: Direct view of $\lambda$, parameter adjustments, and instant uncorrupted reset.
    - *Participant Simulation Mode*: Blind randomized corruption offsets, 30-second trial countdown timer, 5-point Likert enjoyment scale ("Love it" to "Hate it"), 3-point familiarity scale, and JSON data logger/exporter.
- [x] **Python DSP & Feature Analysis Package (`dsp/`)**:
  - `dsp/transformations.py`: Mathematical harmonic transformations with strict $\lambda = 0$ identity preservation.
  - `dsp/analysis.py`: Psychoacoustic feature extraction (spectral centroid, Plomp & Levelt sensory roughness proxy, harmonicity index).
  - `dsp/synthetic.py`: Synthetic complex-tone melody generators producing standardized 5-second clips.
  - `tests/test_dsp.py`: Comprehensive test suite verifying identity preservation and mathematical deformation.
  - Rigorous docstrings across every function.
- [x] **Automated GitHub Pages Deployment**: GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) deploying the interactive sandbox live on every push.
- [ ] **Stimulus Corpus Selection**: Sourcing 1,000 candidate melody pool across historical eras and genres.
- [ ] **Neural Network Architecture**: Formulating the predictive model for harmonic feature interactions with psychological profiles.

---

## Live Web App & How to Run

### 🌐 Live Public URL (GitHub Pages)
The interactive sandbox is hosted publicly at:
**[https://craigthefirst.github.io/Timbre_Project/](https://craigthefirst.github.io/Timbre_Project/)**

Accessible from any device, laptop, tablet, or mobile phone on any network.

### Local Web Server
Run the built-in PowerShell server script from the repository root:
```powershell
.\serve.ps1 -Port 8765
```
Then open [http://localhost:8765](http://localhost:8765) in your browser.

### In Any Web Browser directly:
Open [`sandbox/index.html`](file:///c:/Users/niels/Documents/GitHub/Timbre_Project/sandbox/index.html) directly in Google Chrome, Microsoft Edge, or any modern web browser.

1. Click **"🎵 Load Preset 5s Melody"** (or upload your own WAV/MP3 file).
2. Press **▶ Play** to start continuous 5-second looping audio.
3. Select a corruption function (e.g. *Harmonic Stretching* or *Spectral Tilt*).
4. Drag the **1D Continuous Slider** ($\lambda$) to hear real-time timbral shifts.
5. Switch to **🧪 Participant Simulation** to test the 30-second experimental trial workflow and Likert response interface.

---

## Repository Structure
```
Timbre_Project/
├── AGENTS.md                  # Project rules and agent instructions
├── README.md                  # Project overview and progress tracking
├── sandbox/                   # Interactive Web Audio Sandbox Application
│   ├── index.html             # Main workbench UI
│   ├── style.css              # Modern scientific dashboard styling
│   ├── dsp.js                 # Web Audio DSP engine & looper
│   └── app.js                 # UI controller, timer, visualizer & trial logger
├── dsp/                       # Python DSP & Psychoacoustic Feature Suite
│   ├── __init__.py            # Package initialization
│   ├── transformations.py     # Mathematical harmonic corruption algorithms
│   ├── analysis.py            # Spectral centroid, roughness, and harmonicity
│   └── synthetic.py           # Synthetic 5s melody generators
└── tests/                     # Unit tests
    └── test_dsp.py            # Tests for DSP functions
```
