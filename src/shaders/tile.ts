import { globeHelpers } from './chunks/globe-helpers.js'
import { elevationHelpers } from './chunks/elevation-helpers.js'
import { atmosphericConstants } from './chunks/atmospheric-constants.js'
import { calculateAerialPerspective } from './chunks/calculate-aerial-perspective.js'
import { applyLightingFeatures, declareLightingFeatures } from './chunks/apply-lighting-features.js'
import { getVertexAerialPerspective } from './chunks/get-vertex-aerial-perspective.js'

export const tileVs = /* wgsl */ `
  ${globeHelpers}
  ${elevationHelpers}

  ${atmosphericConstants}
  ${calculateAerialPerspective}

  struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) normal: vec3f,
    @location(2) elevationUv: vec2f,
    @location(3) worldPosition: vec3f,
    @location(4) elevation: f32,
    @location(5) aerialInScattering: vec3f,
    @location(6) aerialTransmittance: vec3f,
  };

  @vertex fn main(
    attributes: Attributes,
  ) -> VSOutput {
    var vsOutput : VSOutput;

    // apply heightmap
    let elevationUv = (texturesMatrices.elevationTexture.matrix * vec3(attributes.uv, 1.0)).xy;
    let elevationMap: vec4f = textureSampleLevel(elevationTexture, elevationSampler, elevationUv, 0.0);

    var elevation: f32 = getElevation(elevationMap);

    vsOutput.elevation = elevation;

    let globePosition = getGlobePosition(
        attributes.uv,
        max(0.0, elevation), // no sub-sea level elevation
        attributes.skirt
    );

    vsOutput.position = getOutputPosition(globePosition);

    vsOutput.uv = attributes.uv;
    vsOutput.elevationUv = elevationUv;

    let n = exp2(f32(tile.current[2].element));
    let tileU = (f32(tile.current[0].element) + attributes.uv.x) / n;
    let tileV = (f32(tile.current[1].element) + attributes.uv.y) / n;

    let lon = tileU * 2.0 * PI - PI;
    let mercatorLat = atan(sinh(PI * (1.0 - 2.0 * tileV)));
    let lat = mercatorToGlobeLatitude(mercatorLat); // Match getGlobePosition!

    vsOutput.normal = vec3f(
        cos(lat) * sin(lon),
        sin(lat),
        cos(lat) * cos(lon)
    );

    let worldPosition = getWorldPosition(globePosition);
    vsOutput.worldPosition =
        worldPosition.xyz / worldPosition.w;

    ${getVertexAerialPerspective}

    return vsOutput;
  }
`

export const tileFs = /* wgsl */ `
  ${elevationHelpers}

  struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) normal: vec3f,
    @location(2) elevationUv: vec2f,
    @location(3) worldPosition: vec3f,
    @location(4) elevation: f32,
    @location(5) aerialInScattering: vec3f,
    @location(6) aerialTransmittance: vec3f,
  };

  // Helper: Compute world-space terrain normal from Terrarium DEM texture
  fn getTerrainWorldNormal(
    elevationTexture: texture_2d<f32>,
    elevationSampler: sampler,
    uv: vec2f,
    radialNormal: vec3f,
    metersPerPixel: f32,
    verticalExaggeration: f32
  ) -> vec3f {
    let texSize = vec2f(textureDimensions(elevationTexture));
    let step = 4.0 / texSize;

    // Sample 4 cardinal neighbors (central difference)
    let hL = getElevation(textureSampleLevel(elevationTexture, elevationSampler, uv - vec2f(step.x, 0.0), 0.0));
    let hR = getElevation(textureSampleLevel(elevationTexture, elevationSampler, uv + vec2f(step.x, 0.0), 0.0));
    let hU = getElevation(textureSampleLevel(elevationTexture, elevationSampler, uv - vec2f(0.0, step.y), 0.0));
    let hD = getElevation(textureSampleLevel(elevationTexture, elevationSampler, uv + vec2f(0.0, step.y), 0.0));

    // Slope in meters per meter (Note: UV.y increases downward = South)
    let scale = verticalExaggeration / (8.0 * metersPerPixel);
    let dzdx = (hR - hL) * scale;
    let dzdy = (hU - hD) * scale; // Positive = slope facing North

    // Build local East-North-Up (ENU) basis vectors from the globe's radialNormal
    let worldUp = vec3f(0.0, 1.0, 0.0); // Adjust if your globe uses Z-up (vec3f(0.0, 0.0, 1.0))
    let east = normalize(cross(worldUp, radialNormal));
    let north = cross(radialNormal, east);

    // Combine slopes with radialNormal
    return normalize(radialNormal - east * dzdx - north * dzdy);
  }

  @fragment fn main(fsInput: VSOutput) -> @location(0) vec4f {
    if(params.globalOpacity < 0.1) {
      discard;
    }

    var outputColor: vec4f = textureSample(satelliteTexture, satelliteSampler, fsInput.uv);

    ${declareLightingFeatures}

    if(features.useSunLight == 1 && features.useSunShadows == 1) {
      // 2. Terrain hillshade from Terrarium DEM
      let terrainNormal = getTerrainWorldNormal(
        elevationTexture,
        elevationSampler,
        fsInput.elevationUv,
        planetUp,
        tile.metersPerPixel,
        1.1 // Vertical exaggeration (1.0 = true scale, 1.5–2.0 = crisp cartographic relief)
      );

      // Signed difference between terrain slope lighting and flat ground (-1.0 to +1.0)
      // Negative = facing away from sun, 0.0 = flat plain, Positive = facing sun
      let slopeDelta = dot(terrainNormal, sunDir) - planetSunDot;

      // Soft S-curve transition (no hard clamp edges or 0.0 cutoff!)
      // Ease smoothly from shaded slope (-0.45) through flat plain (0.0) to sunlit slope (+0.45)
      let softSlope = smoothstep(-0.45, 0.45, slopeDelta);
      let hillshade = mix(0.72, 1.28, softSlope);

      // Fade out hillshade smoothly near the terminator so night side stays clean
      let reliefStrength = smoothstep(-0.05, 0.15, planetSunDot);
      finalHillshade = mix(1.0, hillshade, reliefStrength * 0.65);
    }

    ${applyLightingFeatures}

    if(debug.debugZoom == 1) {
      outputColor.rgb = vec3(f32(tile.current[2].element) / 20.0, f32(debug.elevationZoom) / 20.0, 0.0);
    }

    if(debug.elevation == 1) {
      let elevation = fsInput.elevation / 9000.0;
      outputColor.rgb = vec3(elevation);
    }

    outputColor.a *= params.globalOpacity;

    return outputColor;
  }
`
