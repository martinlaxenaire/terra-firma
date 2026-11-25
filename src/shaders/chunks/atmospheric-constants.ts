export const atmosphericConstants = /* wgsl */ `
  const ATMOSPHERE_HEIGHT: f32 = 100000.0;
  const RAYLEIGH_HEIGHT: f32 = 8000.0;

  // Rayleigh scattering coefficients, per metre.
  const BETA_R: vec3f = vec3f(
    5.8e-6,
    13.5e-6,
    33.1e-6
  );

  const MIE_HEIGHT: f32 = 1200.0;

  // Mie scattering coefficient (approximately neutral across RGB).
  const BETA_M: vec3f = vec3f(21.0e-6);

  // Controls how strongly light scatters in the forward direction.
  // Typical atmospheric values are around 0.75–0.85.
  const MIE_G: f32 = 0.76;

  const SUN_ANGULAR_RADIUS: f32 = 0.00465;
  const SUN_INTENSITY: f32 = 20.0;

  const SUN_GLOW_RADIUS: f32 = 0.025;
  const SUN_GLOW_INTENSITY: f32 = 0.15;
  `
