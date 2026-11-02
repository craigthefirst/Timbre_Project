"""Unit tests for the DSP transformation and psychoacoustic analysis modules.

Ensures that mathematical transformations preserve identity at lambda=0
and produce expected deformations for harmonic stretching, scrunching,
spectral tilt, and odd/even balance.
"""

import unittest
import numpy as np

from dsp.synthetic import generate_complex_tone, generate_5s_melody
from dsp.transformations import (
    apply_harmonic_stretching,
    apply_harmonic_scrunching,
    apply_spectral_tilt,
    apply_odd_even_balance,
    apply_corruption_by_name,
    estimate_fundamental_frequency,
)
from dsp.analysis import (
    compute_spectral_centroid,
    compute_roughness_proxy,
    compute_harmonicity,
    extract_timbre_features,
)


class TestDSPTransformations(unittest.TestCase):
    """Test suite for mathematical timbre transformations."""

    def setUp(self):
        """Set up standard test audio signals."""
        self.sample_rate = 22050
        self.duration = 1.0
        self.f0 = 220.0  # A3
        self.test_tone = generate_complex_tone(
            f0=self.f0,
            duration=self.duration,
            sample_rate=self.sample_rate,
            num_harmonics=8,
        )

    def test_identity_preservation_at_lambda_zero(self):
        """Verify that lambda=0 preserves the exact original audio across all transformations."""
        stretched = apply_harmonic_stretching(self.test_tone, self.sample_rate, lambda_param=0.0, f0=self.f0)
        np.testing.assert_allclose(stretched, self.test_tone, atol=1e-5, err_msg="Stretching did not preserve identity at lambda=0")

        scrunched = apply_harmonic_scrunching(self.test_tone, self.sample_rate, lambda_param=0.0, f0=self.f0)
        np.testing.assert_allclose(scrunched, self.test_tone, atol=1e-5, err_msg="Scrunching did not preserve identity at lambda=0")

        tilted = apply_spectral_tilt(self.test_tone, self.sample_rate, lambda_param=0.0)
        np.testing.assert_allclose(tilted, self.test_tone, atol=1e-5, err_msg="Tilt did not preserve identity at lambda=0")

        balanced = apply_odd_even_balance(self.test_tone, self.sample_rate, lambda_param=0.0, f0=self.f0)
        np.testing.assert_allclose(balanced, self.test_tone, atol=1e-5, err_msg="Odd/even balance did not preserve identity at lambda=0")

    def test_spectral_tilt_centroid_shift(self):
        """Verify that positive lambda increases spectral centroid (raising) and negative lambda decreases it."""
        centroid_orig = compute_spectral_centroid(self.test_tone, self.sample_rate)
        tilted_high = apply_spectral_tilt(self.test_tone, self.sample_rate, lambda_param=0.8)
        centroid_high = compute_spectral_centroid(tilted_high, self.sample_rate)

        tilted_low = apply_spectral_tilt(self.test_tone, self.sample_rate, lambda_param=-0.8)
        centroid_low = compute_spectral_centroid(tilted_low, self.sample_rate)

        self.assertGreater(centroid_high, centroid_orig, "Positive lambda should raise spectral centroid")
        self.assertLess(centroid_low, centroid_orig, "Negative lambda should lower spectral centroid")

    def test_fundamental_frequency_estimation(self):
        """Verify that autocorrelation accurately estimates the fundamental pitch."""
        estimated = estimate_fundamental_frequency(self.test_tone, self.sample_rate)
        self.assertAlmostEqual(estimated, self.f0, delta=5.0, msg=f"Estimated f0 {estimated} too far from {self.f0}")

    def test_5s_melody_generator(self):
        """Verify that the synthetic melody conforms to the 5.0 second specification."""
        melody = generate_5s_melody(sample_rate=self.sample_rate)
        expected_samples = int(5.0 * self.sample_rate)
        self.assertEqual(len(melody), expected_samples, "Synthesized melody must be exactly 5.0 seconds long")

    def test_corruption_dispatcher(self):
        """Verify that apply_corruption_by_name handles all supported transformation names."""
        for name in ["stretching", "scrunching", "raising", "odd_even"]:
            transformed = apply_corruption_by_name(self.test_tone, self.sample_rate, name, lambda_param=0.2)
            self.assertEqual(len(transformed), len(self.test_tone))


if __name__ == "__main__":
    unittest.main()

