export const calculateAerialPerspective = /* wgsl */ `
  struct AerialPerspective {
      inScattering: vec3f,
      transmittance: vec3f,
  };

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

  fn miePhase(cosTheta: f32) -> f32 {
      let g = MIE_G;
      let g2 = g * g;

      let base = max(1.0 + g2 - 2.0 * g * cosTheta, 0.0001);
      let denominator = base * sqrt(base);

      return (1.0 - g2) / (4.0 * PI * denominator);
  }

  fn calculateAerialPerspective(
      rayOrigin: vec3f,
      rayDirection: vec3f,
      maxDistance: f32, // Pass distance to terrain fragment (or 1e20 for sky)
      sunDirection: vec3f,
      earthRadius: f32,
      noise: f32,
      sampleCount: u32,
      useQuadraticSampling: bool
  ) -> AerialPerspective {
      let atmosphereRadius = earthRadius + ATMOSPHERE_HEIGHT;
      let atmosphereHit = raySphere(rayOrigin, rayDirection, atmosphereRadius);

      if (atmosphereHit.y <= 0.0) {
          return AerialPerspective(vec3f(0.0), vec3f(1.0));
      }

      let startDistance = max(atmosphereHit.x, 0.0);
      // Stop integration at the terrain surface!
      let endDistance = min(atmosphereHit.y, maxDistance);

      let rayLength = endDistance - startDistance;
      if (rayLength <= 0.0) {
          return AerialPerspective(vec3f(0.0), vec3f(1.0));
      }

      let invSamples = 1.0 / f32(sampleCount);
      let jitter = noise + 0.5;

      var opticalDepthR = 0.0;
      var opticalDepthM = 0.0;
      var scatteringR = vec3f(0.0);
      var scatteringM = vec3f(0.0);

      let phaseCos = dot(rayDirection, sunDirection);
      let phaseR = (3.0 / (16.0 * PI)) * (1.0 + phaseCos * phaseCos);
      let phaseM = miePhase(phaseCos);

      let negBetaR = -BETA_R;
      let negBetaM = -BETA_M;

      var ambientScattering = vec3f(0.0);
      // Boost night haze reach slightly so distant hills show atmospheric depth even at medium distances
      let nightDensityBoost = 2.2;

      for (var i = 0u; i < sampleCount; i++) {
          // Linear sampling works better for bounded terrain segments than quadratic
          let t = (f32(i) + jitter) * invSamples;
          let distance = startDistance + rayLength * t;

          let sampleT = select(t, t * t, useQuadraticSampling);
          let sampleStep = rayLength * select(invSamples, 2.0 * t * invSamples, useQuadraticSampling);

          let samplePosition = rayOrigin + rayDirection * distance;
          let sampleRadius = length(samplePosition);
          let altitude = max(sampleRadius - earthRadius, 0.0);

          let densityR = exp(-altitude / RAYLEIGH_HEIGHT);
          let densityM = exp(-altitude / MIE_HEIGHT);

          opticalDepthR += densityR * sampleStep;
          opticalDepthM += densityM * sampleStep;

          let up = samplePosition / sampleRadius;
          let sunElevation = dot(up, sunDirection);

          let horizonAngle = -sqrt(max(1.0 - (earthRadius * earthRadius) / (sampleRadius * sampleRadius), 0.0));
          let shadowFactor = smoothstep(horizonAngle - 0.02, horizonAngle + 0.02, sunElevation);

          let viewTransmittanceStep = exp(negBetaR * opticalDepthR + negBetaM * opticalDepthM);

          // Integrate ambient night-sky scattering using physical extinction weights
          // so distant horizon rays smoothly converge to colors.nightSky
          let stepExtinction = (BETA_R * densityR + BETA_M * densityM) * sampleStep * nightDensityBoost;
          ambientScattering += viewTransmittanceStep * colors.nightSky * stepExtinction;

          if (shadowFactor > 0.0) {
              let airmass = 1.0 / max(sunElevation + 0.08 * exp(-sunElevation * 12.0), 0.02);
              let sunOpticalDepthR = densityR * RAYLEIGH_HEIGHT * airmass;
              let sunOpticalDepthM = densityM * MIE_HEIGHT * airmass;

              let totalOpticalR = opticalDepthR + sunOpticalDepthR;
              let totalOpticalM = opticalDepthM + sunOpticalDepthM;

              let transmittance = exp(negBetaR * totalOpticalR + negBetaM * totalOpticalM) * shadowFactor;

              scatteringR += transmittance * densityR * sampleStep;
              scatteringM += transmittance * densityM * sampleStep;
          }
      }

      let sunInScattering = ((scatteringR * BETA_R * phaseR) + (scatteringM * BETA_M * phaseM)) * SUN_INTENSITY;
      let inScattering = sunInScattering + ambientScattering;

      // Total transmittance along the view segment to the ground
      let viewTransmittance = exp(negBetaR * opticalDepthR + negBetaM * opticalDepthM);

      return AerialPerspective(inScattering, viewTransmittance);
  }
  `
