"""Harmonic and Timbral Transformation DSP Module.

This module implements the mathematical corruption and restoration functions
described in the research proposal 'Mapping Timbre Space: Can We Make More
Beautiful Instruments?'.

Transformations modify the harmonic spectra of musical audio clips along
a one-dimensional continuous scalar parameter lambda, such that lambda = 0
(or a calibrated baseline) restores the audio to its uncorrupted state.
"""

from typing import Tuple, Optional
import numpy as np
import scipy.signal as signal


def estimate_fundamental_frequency(
    audio: np.ndarray,
    sample_rate: int,
    fmin: float = 65.0,
    fmax: float = 1000.0,
) -> float:
    """Estimate the fundamental frequency (f0) of an audio signal using normalized autocorrelation.

    Parameters
    ----------
    audio : np.ndarray
        1D floating-point array of audio samples (mono).
    sample_rate : int
        Audio sampling rate in Hertz (e.g., 44100).
    fmin : float, optional
        Minimum plausible fundamental frequency in Hz (default: 65.0, ~C2).
    fmax : float, optional
        Maximum plausible fundamental frequency in Hz (default: 1000.0, ~B5).

    Returns
    -------
    float
        Estimated fundamental frequency in Hz. Returns fmin if no clear peak is detected.

    Notes
    -----
    Uses the peak of the normalized autocorrelation function within the lag range
    corresponding to [sample_rate / fmax, sample_rate / fmin].
    """
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)

    # Detrend and window audio
    centered = audio - np.mean(audio)
    windowed = centered * np.hanning(len(centered))

    # Compute autocorrelation via FFT for efficiency
    n_fft = 2 ** int(np.ceil(np.log2(2 * len(windowed) - 1)))
    fx = np.fft.rfft(windowed, n=n_fft)
    rxx = np.fft.irfft(np.abs(fx) ** 2, n=n_fft)[: len(windowed)]

    min_lag = int(sample_rate / fmax)
    max_lag = int(sample_rate / fmin)

    if max_lag >= len(rxx) or min_lag >= max_lag:
        return 220.0

    search_region = rxx[min_lag:max_lag]
    peak_offset = int(np.argmax(search_region))
    best_lag = min_lag + peak_offset

    if best_lag == 0 or rxx[0] <= 0:
        return 220.0

    return float(sample_rate / best_lag)


def apply_harmonic_stretching(
    audio: np.ndarray,
    sample_rate: int,
    lambda_param: float,
    f0: Optional[float] = None,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """Apply harmonic stretching (inharmonicity deformation) to audio.

    Partials f_k are stretched according to the acoustic stiff-string dispersion
    formula: f_k' = f_k * sqrt(1 + lambda * (k^2 - 1)). When lambda_param = 0,
    the transformation is identity and returns the original uncorrupted audio.

    Parameters
    ----------
    audio : np.ndarray
        Mono audio time series.
    sample_rate : int
        Sampling frequency in Hz.
    lambda_param : float
        Stretching intensity factor. lambda = 0 preserves harmonicity;
        lambda > 0 expands upper partials away from integer multiples;
        lambda < 0 compresses partials inward.
    f0 : float, optional
        Estimated fundamental frequency in Hz. If None, it is estimated automatically.
    n_fft : int, optional
        STFT window size (default: 2048).
    hop_length : int, optional
        STFT hop length (default: 512).

    Returns
    -------
    np.ndarray
        Harmonically stretched audio array, normalized to peak amplitude.
    """
    if np.isclose(lambda_param, 0.0, atol=1e-5):
        return audio.copy()

    if f0 is None:
        f0 = estimate_fundamental_frequency(audio, sample_rate)

    freqs = np.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    window = np.hanning(n_fft)

    # Compute Short-Time Fourier Transform
    _, _, zxx = signal.stft(audio, fs=sample_rate, window=window, nperseg=n_fft, noverlap=n_fft - hop_length)

    warped_zxx = np.zeros_like(zxx)
    num_bins = len(freqs)

    for i, f in enumerate(freqs):
        if f <= 0:
            warped_zxx[i, :] = zxx[i, :]
            continue

        harmonic_num = f / max(f0, 20.0)
        # Apply inharmonic dispersion shift
        dispersion = np.sqrt(max(0.01, 1.0 + lambda_param * (harmonic_num**2 - 1.0)))
        target_f = f * dispersion

        # Find closest destination bin
        target_bin = int(np.round(target_f * (n_fft / sample_rate)))
        if 0 <= target_bin < num_bins:
            warped_zxx[target_bin, :] += zxx[i, :]

    # Inverse STFT to reconstruct time-domain signal
    _, reconstructed = signal.istft(warped_zxx, fs=sample_rate, window=window, nperseg=n_fft, noverlap=n_fft - hop_length)

    # Match original length and normalize
    output = reconstructed[: len(audio)]
    max_val = np.max(np.abs(output))
    if max_val > 0:
        output = (output / max_val) * max(0.01, np.max(np.abs(audio)))

    return output


def apply_harmonic_scrunching(
    audio: np.ndarray,
    sample_rate: int,
    lambda_param: float,
    f0: Optional[float] = None,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """Apply harmonic scrunching (compressing partial intervals towards f0).

    Partials f_k are compressed according to:
        f_k' = f0 + (f_k - f0) * (1.0 - lambda_param)
    When lambda_param = 0, no compression occurs and the audio is uncorrupted.

    Parameters
    ----------
    audio : np.ndarray
        Input mono audio array.
    sample_rate : int
        Sample rate in Hz.
    lambda_param : float
        Scrunching coefficient in range [-0.5, 0.8].
        lambda = 0 is uncorrupted identity.
        lambda > 0 compresses partial spacing (denser spectrum).
        lambda < 0 widens partial spacing.
    f0 : float, optional
        Fundamental frequency in Hz.
    n_fft : int, optional
        FFT window length.
    hop_length : int, optional
        Hop length for analysis.

    Returns
    -------
    np.ndarray
        Transformed audio signal.
    """
    if np.isclose(lambda_param, 0.0, atol=1e-5):
        return audio.copy()

    if f0 is None:
        f0 = estimate_fundamental_frequency(audio, sample_rate)

    freqs = np.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    window = np.hanning(n_fft)

    _, _, zxx = signal.stft(audio, fs=sample_rate, window=window, nperseg=n_fft, noverlap=n_fft - hop_length)

    warped_zxx = np.zeros_like(zxx)
    num_bins = len(freqs)
    compression_factor = max(0.1, 1.0 - lambda_param)

    for i, f in enumerate(freqs):
        if f <= f0:
            warped_zxx[i, :] += zxx[i, :]
        else:
            target_f = f0 + (f - f0) * compression_factor
            target_bin = int(np.round(target_f * (n_fft / sample_rate)))
            if 0 <= target_bin < num_bins:
                warped_zxx[target_bin, :] += zxx[i, :]

    _, reconstructed = signal.istft(warped_zxx, fs=sample_rate, window=window, nperseg=n_fft, noverlap=n_fft - hop_length)

    output = reconstructed[: len(audio)]
    max_val = np.max(np.abs(output))
    if max_val > 0:
        output = (output / max_val) * max(0.01, np.max(np.abs(audio)))

    return output


def apply_spectral_tilt(
    audio: np.ndarray,
    sample_rate: int,
    lambda_param: float,
    reference_freq: float = 1000.0,
) -> np.ndarray:
    """Apply spectral tilt ('raising' or lowering high frequency brightness).

    Applies a smooth logarithmic frequency-dependent gain curve:
        Gain(f) = (f / reference_freq) ** lambda_param
    When lambda_param = 0, Gain(f) = 1 everywhere, exactly preserving the original timbre.

    Parameters
    ----------
    audio : np.ndarray
        Input mono audio array.
    sample_rate : int
        Sample rate in Hz.
    lambda_param : float
        Spectral tilt exponent.
        lambda = 0: Uncorrupted original audio.
        lambda > 0: High-frequency boost ('raising' / brightening).
        lambda < 0: High-frequency roll-off (darkening / dulling).
    reference_freq : float, optional
        Pivot frequency in Hz around which gain is 0 dB (default: 1000.0 Hz).

    Returns
    -------
    np.ndarray
        Spectrally tilted audio array.
    """
    if np.isclose(lambda_param, 0.0, atol=1e-5):
        return audio.copy()

    # Work in frequency domain for exact continuous control
    spectrum = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(len(audio), 1.0 / sample_rate)

    # Avoid divide-by-zero at DC
    clamped_freqs = np.maximum(freqs, 20.0)
    gains = (clamped_freqs / reference_freq) ** lambda_param

    # Smooth shelf bounds to prevent extreme clipping
    gains = np.clip(gains, 0.05, 20.0)

    modified_spectrum = spectrum * gains
    output = np.fft.irfft(modified_spectrum, n=len(audio))

    # Normalize energy to maintain perceived loudness
    rms_in = np.sqrt(np.mean(audio**2))
    rms_out = np.sqrt(np.mean(output**2))
    if rms_out > 0:
        output = output * (rms_in / rms_out)

    return output


def apply_odd_even_balance(
    audio: np.ndarray,
    sample_rate: int,
    lambda_param: float,
    f0: Optional[float] = None,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """Modulate the balance between odd and even harmonics.

    Scales even harmonics by (1 - lambda_param) and odd harmonics by (1 + lambda_param).
    When lambda_param = 0, returns uncorrupted original audio.

    Parameters
    ----------
    audio : np.ndarray
        Mono audio array.
    sample_rate : int
        Sample rate in Hz.
    lambda_param : float
        Balance parameter in range [-1.0, 1.0].
        lambda = 0: Uncorrupted balance.
        lambda > 0: Emphasizes odd harmonics (hollow, clarinet-like character).
        lambda < 0: Emphasizes even harmonics (warm octave character).
    f0 : float, optional
        Fundamental frequency in Hz.
    n_fft : int, optional
        STFT segment size.
    hop_length : int, optional
        STFT hop length.

    Returns
    -------
    np.ndarray
        Reconstructed audio with altered odd/even harmonic ratio.
    """
    if np.isclose(lambda_param, 0.0, atol=1e-5):
        return audio.copy()

    if f0 is None:
        f0 = estimate_fundamental_frequency(audio, sample_rate)

    freqs = np.fft.rfftfreq(n_fft, 1.0 / sample_rate)
    window = np.hanning(n_fft)

    _, _, zxx = signal.stft(audio, fs=sample_rate, window=window, nperseg=n_fft, noverlap=n_fft - hop_length)

    gain_curve = np.ones(len(freqs), dtype=np.float32)
    bandwidth = max(f0 * 0.35, 25.0)

    for harmonic_idx in range(1, 30):
        h_freq = harmonic_idx * f0
        if h_freq >= sample_rate / 2.0:
            break

        is_even = (harmonic_idx % 2 == 0)
        target_gain = (1.0 - lambda_param) if is_even else (1.0 + lambda_param)
        target_gain = max(0.02, target_gain)

        # Apply Gaussian band around the harmonic peak
        dist = (freqs - h_freq) / bandwidth
        harmonic_mask = np.exp(-0.5 * (dist**2))
        gain_curve = gain_curve + harmonic_mask * (target_gain - 1.0)

    gain_curve = np.clip(gain_curve, 0.05, 5.0)[:, np.newaxis]
    modified_zxx = zxx * gain_curve

    _, reconstructed = signal.istft(modified_zxx, fs=sample_rate, window=window, nperseg=n_fft, noverlap=n_fft - hop_length)

    output = reconstructed[: len(audio)]
    max_val = np.max(np.abs(output))
    if max_val > 0:
        output = (output / max_val) * max(0.01, np.max(np.abs(audio)))

    return output


def apply_corruption_by_name(
    audio: np.ndarray,
    sample_rate: int,
    corruption_name: str,
    lambda_param: float,
    f0: Optional[float] = None,
) -> np.ndarray:
    """Dispatch audio corruption by name and continuous scalar slider parameter.

    Parameters
    ----------
    audio : np.ndarray
        Input audio array.
    sample_rate : int
        Sample rate in Hz.
    corruption_name : str
        One of 'stretching', 'scrunching', 'raising', or 'odd_even'.
    lambda_param : float
        Scalar corruption amount. A value of 0.0 always yields the uncorrupted audio.
    f0 : float, optional
        Fundamental frequency override.

    Returns
    -------
    np.ndarray
        Transformed audio array.
    """
    name = corruption_name.lower().strip()
    if name in ("stretching", "harmonic_stretching", "stretch"):
        return apply_harmonic_stretching(audio, sample_rate, lambda_param, f0=f0)
    elif name in ("scrunching", "harmonic_scrunching", "scrunch", "compression"):
        return apply_harmonic_scrunching(audio, sample_rate, lambda_param, f0=f0)
    elif name in ("raising", "spectral_tilt", "tilt", "brightness"):
        return apply_spectral_tilt(audio, sample_rate, lambda_param)
    elif name in ("odd_even", "odd_even_balance", "even_odd"):
        return apply_odd_even_balance(audio, sample_rate, lambda_param, f0=f0)
    else:
        raise ValueError(f"Unknown corruption function '{corruption_name}'. Choose from: stretching, scrunching, raising, odd_even.")
