export const skyFs = `
  const PI: f32 = 3.14159265359;

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

  fn raySphere(
    origin: vec3f,
    direction: vec3f,
    radius: f32
  ) -> vec2f {
    let b = dot(origin, direction);
    let c = dot(origin, origin) - radius * radius;

    let discriminant = b * b - c;

    if (discriminant < 0.0) {
      return vec2f(-1.0, -1.0);
    }

    let s = sqrt(discriminant);

    return vec2f(-b - s, -b + s);
  }

  fn densityAt(position: vec3f, earthRadius: f32) -> f32 {
    let altitude = max(length(position) - earthRadius, 0.0);

    return exp(-altitude / RAYLEIGH_HEIGHT);
  }

  fn mieDensityAt(position: vec3f, earthRadius: f32) -> f32 {
      let altitude = max(length(position) - earthRadius, 0.0);
      return exp(-altitude / MIE_HEIGHT);
  }

  fn miePhase(cosTheta: f32) -> f32 {
      let g = MIE_G;
      let g2 = g * g;

      let denominator = pow(
          max(1.0 + g2 - 2.0 * g * cosTheta, 0.0001),
          1.5
      );

      return (1.0 - g2) / (4.0 * PI * denominator);
  }

  fn rayIntersectsGround(
    position: vec3f,
    direction: vec3f,
    earthRadius: f32
  ) -> bool {
    let hit = raySphere(position, direction, earthRadius);

    return hit.x > 0.001;
  }

  fn raySphereNearestPositive(
      origin: vec3f,
      direction: vec3f,
      radius: f32
  ) -> f32 {
      let hit = raySphere(origin, direction, radius);

      if (hit.x > 0.001) {
          return hit.x;
      }

      if (hit.y > 0.001) {
          return hit.y;
      }

      return -1.0;
  }

  fn calculateAtmosphere(
      rayOrigin: vec3f,
      rayDirection: vec3f,
      sunDirection: vec3f,
      earthRadius: f32
  ) -> vec3f {
      let atmosphereRadius = earthRadius + ATMOSPHERE_HEIGHT;

      let atmosphereHit = raySphere(
          rayOrigin,
          rayDirection,
          atmosphereRadius
      );

      if (atmosphereHit.y <= 0.0) {
          return vec3f(0.0);
      }

      let startDistance = max(atmosphereHit.x, 0.0);
      var endDistance = atmosphereHit.y;

      // Stop atmospheric integration at the planet surface.
      let groundHit = raySphere(
          rayOrigin,
          rayDirection,
          earthRadius
      );

      if (groundHit.x > startDistance) {
          endDistance = min(endDistance, groundHit.x);
      }

      if (endDistance <= startDistance) {
          return vec3f(0.0);
      }

      let stepSize = (endDistance - startDistance) / f32(params.viewSamples);

      // Separate optical depths.
      var opticalDepthR = 0.0;
      var opticalDepthM = 0.0;

      // Separate scattering contributions.
      var scatteringR = vec3f(0.0);
      var scatteringM = vec3f(0.0);

      let phaseCos = dot(rayDirection, sunDirection);

      // Rayleigh phase function.
      let phaseR = (3.0 / (16.0 * PI)) *
          (1.0 + phaseCos * phaseCos);

      // Mie phase function.
      let phaseM = miePhase(phaseCos);

      for (var i = 0u; i < params.viewSamples; i++) {
          let t = (f32(i) + 0.5) / f32(params.viewSamples);

          // Concentrate samples near the beginning of the ray.
          let curvedT = t * t;

          let distance = startDistance +
              (endDistance - startDistance) * curvedT;

          let sampleStep = (endDistance - startDistance) *
              (2.0 * t) / f32(params.viewSamples);

          let samplePosition = rayOrigin + rayDirection * distance;

          // Atmospheric densities.
          let densityR = densityAt(samplePosition, earthRadius);
          let densityM = mieDensityAt(samplePosition, earthRadius);

          let up = normalize(samplePosition);
          let sunElevation = dot(up, sunDirection);

          // The planet blocks direct sunlight.
          if (
              sunElevation > 0.0 &&
              !rayIntersectsGround(samplePosition, sunDirection, earthRadius)
          ) {
              // Approximate optical depth towards the sun.
              let sunOpticalDepthR =
                  densityR * RAYLEIGH_HEIGHT /
                  max(sunElevation, 0.05);

              let sunOpticalDepthM =
                  densityM * MIE_HEIGHT /
                  max(sunElevation, 0.05);

              // Sunlight attenuation through both atmospheric components.
              let sunTransmittance = exp(
                  -BETA_R * sunOpticalDepthR
                  -BETA_M * sunOpticalDepthM
              );

              // View-ray attenuation through both components.
              let viewTransmittance = exp(
                  -BETA_R * opticalDepthR
                  -BETA_M * opticalDepthM
              );

              let transmittance = sunTransmittance * viewTransmittance;

              // Rayleigh scattering.
              scatteringR +=
                  transmittance *
                  BETA_R *
                  densityR *
                  phaseR *
                  stepSize;

              // Mie scattering.
              scatteringM +=
                  transmittance *
                  BETA_M *
                  densityM *
                  phaseM *
                  stepSize;
          }

          // Accumulate optical depths along the view ray.
          opticalDepthR += densityR * sampleStep;
          opticalDepthM += densityM * sampleStep;
      }

      let scattering = scatteringR + scatteringM;

      // Exposure adjustment.
      let exposure = 20.0;

      return vec3f(1.0) - exp(-scattering * exposure);
  }

  fn getWorldRay(uv: vec2f) -> vec3f {
      // Convert UV [0, 1] to clip-space XY [-1, 1].
      // Flip Y because screen UV typically has its origin at the top-left.
      let clipXY = vec2f(
          uv.x * 2.0 - 1.0,
          1.0 - uv.y * 2.0
      );

      // Reconstruct a point on the far plane.
      // For WebGPU reverse-Z, the far depth is 0.0.
      let clipPosition = vec4f(clipXY, 0.0, 1.0);

      let worldPosition =
          projection.inverseViewProjectionMatrix * clipPosition;

      let worldPoint = worldPosition.xyz / worldPosition.w;

      return normalize(worldPoint - camera.position);
  }

  fn calculateSun(
      rayDirection: vec3f,
      sunDirection: vec3f
  ) -> vec3f {
      let cosAngle = dot(rayDirection, sunDirection);

      let sunCosRadius = cos(SUN_ANGULAR_RADIUS);

      // Sharp solar disc.
      let sunDisc = smoothstep(
          sunCosRadius - 0.00001,
          sunCosRadius + 0.00001,
          cosAngle
      );

      // Soft glow surrounding the sun.
      let angle = acos(clamp(cosAngle, -1.0, 1.0));

      let glow = exp(
          -pow(angle / SUN_GLOW_RADIUS, 2.0)
      );

      let discColor = vec3f(1.0, 0.97, 0.88);
      let glowColor = vec3f(1.0, 0.65, 0.35);

      return
          discColor * sunDisc * SUN_INTENSITY +
          glowColor * glow * SUN_GLOW_INTENSITY;
  }

  fn interleavedGradientNoise(pixel: vec2f) -> f32 {
      let magic = vec3f(0.06711056, 0.00583715, 52.9829189);

      return fract(
          magic.z * fract(dot(pixel, magic.xy))
      ) - 0.5;
  }

  fn directionToEquirectangularUV(direction: vec3f) -> vec2f {
      let dir = normalize(direction);

      let longitude = atan2(dir.z, dir.x);
      let latitude = asin(clamp(dir.y, -1.0, 1.0));

      let u = 0.5 - longitude / (2.0 * PI);
      let v = 0.5 - latitude / PI;

      return vec2f(fract(u), v);
  }

  fn sampleStars(rayDirection: vec3f) -> vec3f {
      let uv = directionToEquirectangularUV(rayDirection);

      return textureSample(
          starsMap,
          defaultSampler,
          uv
      ).rgb;
  }

  fn calculateNightHaze(
      rayOrigin: vec3f,
      rayDirection: vec3f,
      nightFactor: f32,
      earthRadius: f32
  ) -> vec3f {
      let cameraDistance = length(rayOrigin);

      // Apparent angular radius of the planet.
      let planetAngularRadius = asin(
          clamp(earthRadius / cameraDistance, 0.0, 1.0)
      );

      let up = normalize(rayOrigin);

      let elevation = max(dot(rayDirection, up), 0.0);

      // Narrow the haze as the camera moves away.
      let horizonWidth = planetAngularRadius * 0.12;

      let horizonFactor = exp(
          -elevation / max(horizonWidth, 0.0001)
      );

      // Also reduce intensity with distance.
      let distanceFactor = smoothstep(
          earthRadius * 1.0,
          earthRadius * 1.015,
          cameraDistance
      );

      let hazeIntensity = mix(1.15, 0.0, distanceFactor);

      let hazeColor = vec3f(0.025, 0.045, 0.075);

      return hazeColor * horizonFactor * nightFactor * hazeIntensity;
  }

  struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
  };

  @fragment fn main(fsInput: VSOutput) -> @location(0) vec4f {
    let rayDirection = getWorldRay(fsInput.uv);
    let sunDirection = normalize(globe.sunPosition);

    let stars = sampleStars(rayDirection) * 0.5;

    let sky = calculateAtmosphere(
      camera.position,
      rayDirection,
      sunDirection,
      globe.earthRadius
    );

    let sun = calculateSun(
        rayDirection,
        sunDirection
    );

    let noise = interleavedGradientNoise(
        fsInput.position.xy
    );

    let atmosphericSky = sky + sun + vec3f(noise / 255.0);
    let skyBrightness = max(
        atmosphericSky.r,
        max(atmosphericSky.g, atmosphericSky.b)
    );

    let nightFactor = smoothstep(0.5, 1.0, 1.0 - skyBrightness);

    let nightHaze = calculateNightHaze(
        camera.position,
        rayDirection,
        nightFactor,
        globe.earthRadius
    );

    return vec4f(atmosphericSky + stars * nightFactor + nightHaze, 1.0);
  }
`
