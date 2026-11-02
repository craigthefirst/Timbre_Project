"""Synthetic Audio & Melody Generator.

Generates controlled complex-tone melodies and harmonic audio snippets
suitable for piloting the timbre corruption sandbox and benchmarking DSP pipelines.
"""

from typing import List, Tuple
import numpy as np


def generate_complex_tone(
    f0: float,
    duration: float,
    sample_rate: int = 44100,
    num_harmonics: int = 12,
    harmonic_falloff: float = 1.0,
) -> np.ndarray:
    """Generate a single musical tone with a rich harmonic spectrum.

    Parameters
    ----------
    f0 : float
        Fundamental frequency in Hz.
    duration : float
        Duration of the tone in seconds.
    sample_rate : int, optional
        Audio sample rate in Hz (default: 44100).
    num_harmonics : int, optional
        Number of integer harmonic partials to generate (default: 12).
    harmonic_falloff : float, optional
        Spectral roll-off exponent. Amplitudes scale as 1 / (k ** harmonic_falloff).

    Returns
    -------
    np.ndarray
        Synthesized audio waveform array.
    """
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    signal = np.zeros_like(t)

    for k in range(1, num_harmonics + 1):
        freq = k * f0
        if freq >= sample_rate / 2.0:
            break
        amp = 1.0 / (k**harmonic_falloff)
        signal += amp * np.sin(2.0 * np.pi * freq * t)

    # Smooth attack and release envelope to prevent clicks
    envelope_len = int(sample_rate * min(0.02, duration / 4))
    if envelope_len > 0:
        attack = np.linspace(0, 1, envelope_len)
        release = np.linspace(1, 0, envelope_len)
        signal[:envelope_len] *= attack
        signal[-envelope_len:] *= release

    max_val = np.max(np.abs(signal))
    if max_val > 0:
        signal = signal / max_val * 0.8

    return signal


def generate_5s_melody(
    sample_rate: int = 44100,
    tempo_bpm: float = 120.0,
    base_f0: float = 261.63,  # C4
) -> np.ndarray:
    """Generate a continuous 5-second musical melody clip with rich harmonic timbre.

    Produces an excerpt conforming to the 5-second duration requirement
    described in the research proposal.

    Parameters
    ----------
    sample_rate : int, optional
        Sample rate in Hz (default: 44100).
    tempo_bpm : float, optional
        Tempo in beats per minute (default: 120).
    base_f0 : float, optional
        Base pitch in Hz (default: 261.63 Hz, C4).

    Returns
    -------
    np.ndarray
        5-second mono audio array with a seamless loopable musical phrase.
    """
    total_duration = 5.0
    total_samples = int(total_duration * sample_rate)

    # Musical interval ratios (C major arpeggio / motif: C4, E4, G4, A4, B4, C5)
    ratios = [1.0, 1.25, 1.5, 1.667, 1.875, 2.0, 1.5, 1.25]
    note_duration = total_duration / len(ratios)

    full_audio = np.zeros(total_samples, dtype=np.float32)

    for i, ratio in enumerate(ratios):
        tone = generate_complex_tone(
            f0=base_f0 * ratio,
            duration=note_duration,
            sample_rate=sample_rate,
            num_harmonics=10,
            harmonic_falloff=0.9,
        )
        start_idx = int(i * note_duration * sample_rate)
        end_idx = min(start_idx + len(tone), total_samples)
        full_audio[start_idx:end_idx] = tone[: end_idx - start_idx]

    # Apply brief crossfade at ends for seamless looping
    crossfade_len = int(sample_rate * 0.05)
    fade_in = np.linspace(0, 1, crossfade_len)
    fade_out = np.linspace(1, 0, crossfade_len)
    full_audio[:crossfade_len] *= fade_in
    full_audio[-crossfade_len:] *= fade_out

    return full_audio
