import { PI, HALF_PI, MAX_LATITUDE, POLAR_TRANSITION_START } from '../../config/constants'

export const globeHelpers = /* wgsl */ `
  const PI = ${PI};
  const HALF_PI = ${HALF_PI};

  const MAX_MERCATOR_LAT = ${MAX_LATITUDE};
  const POLAR_TRANSITION_START = ${POLAR_TRANSITION_START} * PI / 180.0;

  // Convert a Mercator latitude into a spherical latitude.
  // Standard Mercator is preserved until POLAR_TRANSITION_START.
  fn mercatorToGlobeLatitude(mercatorLat: f32) -> f32 {
      let absLat = abs(mercatorLat);
      let signLat = sign(mercatorLat);

      if (absLat <= POLAR_TRANSITION_START) {
          return mercatorLat;
      }

      let range = MAX_MERCATOR_LAT - POLAR_TRANSITION_START;
      let t = clamp(
          (absLat - POLAR_TRANSITION_START) / range,
          0.0,
          1.0
      );

      let targetRange = HALF_PI - POLAR_TRANSITION_START;
      let r = targetRange / range;

      // Cubic Hermite interpolation:
      // h(0) = 0, h'(0) = 1
      // h(1) = r, h'(1) = 0
      let h =
          t
          + (3.0 * r - 2.0) * t * t
          + (1.0 - 2.0 * r) * t * t * t;

      return signLat * (POLAR_TRANSITION_START + range * h);
  }

  fn getGlobePosition(
      uv: vec2f,
      elevation: f32,
      skirt: f32,
  ) -> vec3f {
      let n = exp2(f32(tile.current[2].element));

      let tileU = (f32(tile.current[0].element) + uv.x) / n;
      let tileV = (f32(tile.current[1].element) + uv.y) / n;

      let lon = tileU * 2.0 * PI - PI;

      let mercatorLat = atan(sinh(PI * (1.0 - 2.0 * tileV)));

      // Extend Mercator coverage to the poles
      let lat = mercatorToGlobeLatitude(mercatorLat);

      let radius =
          globe.earthRadius
          + elevation
          - skirt * params.skirtDepth;

      let cosLat = cos(lat);

      return vec3f(
          radius * cosLat * sin(lon),
          radius * sin(lat),
          radius * cosLat * cos(lon)
      );
  }`
