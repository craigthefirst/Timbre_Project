"""Acoustic and Timbral Feature Analysis Module.

Provides psychoacoustic feature extractors (spectral centroid, roughness,
harmonicity, and spectral flux) to analyze audio stimuli and evaluate
the effects of harmonic corruption functions.
"""

from typing import Dict, Tuple
import numpy as np


def compute_spectral_centroid(audio: np.ndarray, sample_rate: int, n_fft: int = 2048) -> float:
    """Calculate the average spectral centroid (brightness predictor) in Hertz.

    The spectral centroid indicates where the center of mass of the spectrum is located:
        Centroid = sum(f * |X(f)|) / sum(|X(f)|)

    Parameters
    ----------
    audio : np.ndarray
        Mono audio sample array.
    sample_rate : int
        Audio sampling rate in Hz.
    n_fft : int, optional
        Window size for FFT (default: 2048).

    Returns
    -------
    float
        Mean spectral centroid across time in Hz.
    """
    if len(audio) < n_fft:
        n_fft = 2 ** int(np.floor(np.log2(max(len(audio), 64))))

    freqs = np.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    window = np.hanning(n_fft)

    hop = n_fft // 2
    centroids = []

    for start in range(0, len(audio) - n_fft + 1, hop):
        frame = audio[start : start + n_fft] * window
        magnitude = np.abs(np.fft.rfft(frame))
        total_mag = np.sum(magnitude)

        if total_mag > 1e-9:
            centroid = np.sum(freqs * magnitude) / total_mag
            centroids.append(centroid)

    if not centroids:
        return 0.0

    return float(np.mean(centroids))


def compute_roughness_proxy(audio: np.ndarray, sample_rate: int) -> float:
    """Estimate sensory roughness based on Plomp & Levelt critical bandwidth model.

    Computes beating interaction among spectral peaks within critical bandwidths.
    Pairs of frequencies with differences in the critical bandwidth (~0.25 to 1.0 critical bandwidth)
    generate maximum beating and sensory roughness.

    Parameters
    ----------
    audio : np.ndarray
        Mono audio array.
    sample_rate : int
        Sample rate in Hz.

    Returns
    -------
    float
        Relative roughness metric (arbitrary positive unit).
    """
    # Extract dominant spectral peaks from magnitude spectrum
    n_fft = 4096
    if len(audio) < n_fft:
        n_fft = len(audio)

    window = np.hanning(len(audio[:n_fft]))
    spectrum = np.abs(np.fft.rfft(audio[:n_fft] * window))
    freqs = np.fft.rfftfreq(len(audio[:n_fft]), 1.0 / sample_rate)

    # Pick top 20 significant peaks
    if len(spectrum) < 5:
        return 0.0

    threshold = np.max(spectrum) * 0.02
    peak_indices = np.where((spectrum[1:-1] > spectrum[:-2]) & (spectrum[1:-1] > spectrum[2:]) & (spectrum[1:-1] > threshold))[0] + 1

    if len(peak_indices) > 20:
        sorted_by_mag = peak_indices[np.argsort(spectrum[peak_indices])[::-1]]
        peak_indices = sorted_by_mag[:20]

    f_peaks = freqs[peak_indices]
    a_peaks = spectrum[peak_indices]

    total_roughness = 0.0
    for i in range(len(f_peaks)):
        for j in range(i + 1, len(f_peaks)):
            f1, f2 = min(f_peaks[i], f_peaks[j]), max(f_peaks[i], f_peaks[j])
            a1, a2 = a_peaks[i], a_peaks[j]

            # Critical bandwidth approximation (Zwicker & Terhardt)
            cbw = 25.0 + 75.0 * (1.0 + 1.4 * (f1 / 1000.0) ** 2) ** 0.69
            delta_f = f2 - f1
            s = 0.24 / (0.0207 * f1 + 18.0)
            roughness_pair = (a1 * a2) * (np.exp(-3.5 * s * delta_f) - np.exp(-5.75 * s * delta_f))
            if roughness_pair > 0:
                total_roughness += roughness_pair

    return float(total_roughness)


def compute_harmonicity(audio: np.ndarray, sample_rate: int) -> float:
    """Estimate harmonicity via normalized autocorrelation (harmonic-to-noise proxy).

    Parameters
    ----------
    audio : np.ndarray
        Mono audio signal.
    sample_rate : int
        Sampling frequency in Hz.

    Returns
    -------
    float
        Harmonicity index in [0.0, 1.0], where 1.0 represents a perfectly periodic harmonic tone.
    """
    centered = audio - np.mean(audio)
    if np.allclose(centered, 0):
        return 0.0

    energy = np.sum(centered**2)
    if energy <= 0:
        return 0.0

    n_fft = 2 ** int(np.ceil(np.log2(2 * len(centered) - 1)))
    fx = np.fft.rfft(centered, n=n_fft)
    rxx = np.fft.irfft(np.abs(fx) ** 2, n=n_fft)[: len(centered)]

    norm_rxx = rxx / rxx[0]

    min_lag = int(sample_rate / 1000.0)  # max f0 = 1000 Hz
    max_lag = int(sample_rate / 60.0)    # min f0 = 60 Hz

    if max_lag >= len(norm_rxx) or min_lag >= max_lag:
        return 0.0

    peak_correlation = np.max(norm_rxx[min_lag:max_lag])
    return float(np.clip(peak_correlation, 0.0, 1.0))


def extract_timbre_features(audio: np.ndarray, sample_rate: int) -> Dict[str, float]:
    """Extract a comprehensive summary dictionary of timbral and acoustic features.

    Parameters
    ----------
    audio : np.ndarray
        Input mono audio array.
    sample_rate : int
        Audio sampling rate in Hz.

    Returns
    -------
    Dict[str, float]
        Dictionary containing spectral centroid, roughness proxy, harmonicity,
        and RMS energy metrics.
    """
    return {
        "spectral_centroid_hz": compute_spectral_centroid(audio, sample_rate),
        "roughness_metric": compute_roughness_proxy(audio, sample_rate),
        "harmonicity_index": compute_harmonicity(audio, sample_rate),
        "rms_energy": float(np.sqrt(np.mean(audio**2))),
    }

