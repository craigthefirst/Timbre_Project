# Timbre Space Project: Mapping Timbre Space

## Overview
This repository contains the software, experimental protocols, and analysis pipelines for the research project:
**"Mapping Timbre Space: Can We Make More Beautiful Instruments?"**

The study investigates how controlled mathematical alterations to the harmonic spectra of musical melodies interact with auditory preferences, perceived roughness, harmonicity, and familiarity, and aims to model the geometry of high-dimensional timbre space.

## Key Experimental Specifications
- **Audio Stimuli**: 5-second continuous looping melody clips sampled across musical genres and eras.
- **Harmonic Corruption**: Deformations applied to audio harmonics (e.g., stretching, scrunching, raising).
- **Interactive Slider**: A 1-dimensional continuous slider that applies scalable transformations, with a specific position restoring the audio to its uncorrupted state.
- **Trial Procedure**: 30-second trial window where participants adjust the slider to maximize a target auditory quality, followed by enjoyment (5-point Likert) and familiarity (3-point) ratings, interspersed with psychometric palate cleansers.

## Current Progress
- [x] Initial research proposal review and experimental specifications breakdown.
- [x] Designed architecture and implementation plan for the **Timbre Space Sandbox App** (interactive audio upload, looping, harmonic corruption selection, 1D slider manipulation, real-time spectral visualization, and participant simulation mode).
- [ ] Implement Sandbox Application (Web Audio / DSP engine and UI).
- [ ] Implement offline Python DSP processing modules with complete docstrings.
- [ ] Candidate audio stimulus selection and automated batch processing.

## Repository Structure
- `AGENTS.md`: Project guidelines and automation rules.
- `README.md`: Project documentation and progress tracking.
- `dsp/`: (Planned) Python harmonic analysis and resynthesis modules.
- `sandbox/`: (Planned) Interactive audio corruption sandbox application.
