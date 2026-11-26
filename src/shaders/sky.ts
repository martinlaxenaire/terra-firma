import { atmosphericConstants } from './chunks/atmospheric-constants.js'
import { calculateAerialPerspective } from './chunks/calculate-aerial-perspective.js'

export const skyFs = `
  const PI = ${Math.PI};

  ${atmosphericConstants}
  ${calculateAerialPerspective}

  fn densityAt(position: vec3f, earthRadius: f32) -> f32 {
    let altitude = max(length(position) - earthRadius, 0.0);

    return exp(-altitude / RAYLEIGH_HEIGHT);
  }

  fn mieDensityAt(position: vec3f, earthRadius: f32) -> f32 {
      let altitude = max(length(position) - earthRadius, 0.0);
      return exp(-altitude / MIE_HEIGHT);
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

  fn interleavedGradientNoise(pixel: vec2f) -> f32 {
      let magic = vec3f(0.06711056, 0.00583715, 52.9829189);

      return fract(
          magic.z * fract(dot(pixel, magic.xy))
      ) - 0.5;
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

  struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
  };

  @fragment fn main(fsInput: VSOutput) -> @location(0) vec4f {
    let rayDirection = getWorldRay(fsInput.uv);
    let sunDirection = normalize(globe.sunPosition);

    var stars = sampleStars(rayDirection) * 0.5;

    let noise = interleavedGradientNoise(fsInput.position.xy);

    let skyPerspective = calculateAerialPerspective(
      camera.position,
      rayDirection,
      1e20, // Sky doesn't hit terrain (terrain depth buffer occludes it)
      sunDirection,
      globe.earthRadius,
      noise,
      params.viewSamples,
      true // Quadratic sampling for long sky rays
    );

    var hdrColor = skyPerspective.inScattering;

    let groundHit = raySphere(camera.position, rayDirection, globe.earthRadius);
    if (groundHit.x <= 0.0) {
        hdrColor += calculateSun(rayDirection, sunDirection);

        // Measure how bright the scattered sky is in this direction
        let skyLuminance = dot(skyPerspective.inScattering, vec3f(0.2126, 0.7152, 0.0722));
        // Suppress stars when the sky is bright (simulates camera exposure adaptation).
        // Tune 0.04 (stars vanish completely by early civil twilight) to 0.15 (visible deeper into dusk).
        let starVisibility = exp(-skyLuminance / 0.015);

        let starIntensity = 1.0;
        hdrColor += stars * skyPerspective.transmittance * starVisibility * starIntensity;
    }

    return vec4f(hdrColor, 1.0);
  }
`
