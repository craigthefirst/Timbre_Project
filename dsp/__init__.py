"""Digital Signal Processing (DSP) and Timbre Manipulation Package.

Modules:
- transformations: Mathematical harmonic deformation algorithms (stretching, scrunching, tilt, balance).
- analysis: Psychoacoustic feature extractors (centroid, roughness, harmonicity).
- synthetic: Synthetic complex-tone melody generators.
"""

from .transformations import (
    apply_harmonic_stretching,
    apply_harmonic_scrunching,
    apply_spectral_tilt,
    apply_odd_even_balance,
    apply_corruption_by_name,
    estimate_fundamental_frequency,
)
from .analysis import (
    compute_spectral_centroid,
    compute_roughness_proxy,
    compute_harmonicity,
    extract_timbre_features,
)
from .synthetic import generate_complex_tone, generate_5s_melody

__all__ = [
    "apply_harmonic_stretching",
    "apply_harmonic_scrunching",
    "apply_spectral_tilt",
    "apply_odd_even_balance",
    "apply_corruption_by_name",
    "estimate_fundamental_frequency",
    "compute_spectral_centroid",
    "compute_roughness_proxy",
    "compute_harmonicity",
    "extract_timbre_features",
    "generate_complex_tone",
    "generate_5s_melody",
]

