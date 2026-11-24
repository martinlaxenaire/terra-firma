import { globeHelpers } from './chunks/globe-helpers.js'
import { elevationHelpers } from './chunks/elevation-helpers.js'

export const tileVs = /* wgsl */ `
  ${globeHelpers}
  ${elevationHelpers}

  struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) normal: vec3f,
    @location(2) elevationUv: vec2f,
    @location(3) worldPosition: vec3f,
    @location(4) elevation: f32,
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

    var color: vec4f = textureSample(satelliteTexture, satelliteSampler, fsInput.uv);

    let radialNormal = normalize(fsInput.normal);
    let sunDir = normalize(globe.sunPosition);

    // Cosine of zenith angle (-1.0 = midnight, 0.0 = horizon, +1.0 = noon)
    let sunDot = dot(radialNormal, sunDir);
    let dayFactor = smoothstep(-0.16, 0.14, sunDot);

    var finalHillshade = 1.0;

    if(params.useSunLight == 1 && params.useSunShadows == 1) {
      // 2. Terrain hillshade from Terrarium DEM
      let terrainNormal = getTerrainWorldNormal(
        elevationTexture,
        elevationSampler,
        fsInput.elevationUv,
        radialNormal,
        tile.metersPerPixel,
        1.1 // Vertical exaggeration (1.0 = true scale, 1.5–2.0 = crisp cartographic relief)
      );

      // Signed difference between terrain slope lighting and flat ground (-1.0 to +1.0)
      // Negative = facing away from sun, 0.0 = flat plain, Positive = facing sun
      let slopeDelta = dot(terrainNormal, sunDir) - sunDot;

      // Soft S-curve transition (no hard clamp edges or 0.0 cutoff!)
      // Ease smoothly from shaded slope (-0.45) through flat plain (0.0) to sunlit slope (+0.45)
      let softSlope = smoothstep(-0.45, 0.45, slopeDelta);
      let hillshade = mix(0.72, 1.28, softSlope);

      // Fade out hillshade smoothly near the terminator so night side stays clean
      let reliefStrength = smoothstep(-0.05, 0.15, sunDot);
      finalHillshade = mix(1.0, hillshade, reliefStrength * 0.65);
    }

    var fogColor = vec4(colors.fog, 1.0);

    if(params.useSunLight == 1) {
      // 3. Base winter-sun intensity + sunset glow
      let wrapDiffuse = clamp((sunDot + 0.15) / 1.15, 0.0, 1.0);
      let sunIntensity = mix(0.45, 1.05, pow(wrapDiffuse, 0.75)) * finalHillshade;

      let horizonGlow = exp(-pow((sunDot + 0.02) * 10.5, 2.0));
      let subtleTint = mix(vec3f(1.0), colors.sunset, horizonGlow * 0.45);

      // 4. Readable cool night side (starlight / moonlight ambient)
      let nightAmbient = color.rgb * colors.nightTint + colors.nightBase;
      let dayLit = max(color.rgb * sunIntensity * subtleTint, nightAmbient * 1.15);

      // Smoothly blend night ambient into day lighting
      color.rgb = mix(nightAmbient, max(dayLit, nightAmbient), dayFactor);

      let nightFogAmbient = fogColor.rgb * colors.nightTint + colors.nightBase;
      let dayFogLit = max(fogColor.rgb * sunIntensity * subtleTint, nightFogAmbient * 1.15);

      // Smoothly blend night ambient into day lighting
      fogColor.rgb = mix(nightFogAmbient, max(dayFogLit, nightFogAmbient), dayFactor);
    }

    if(params.useFog == 1) {
      let distanceToCamera = distance(
        fsInput.worldPosition,
        camera.position
      );

      let fogDensity: f32 = 1.0;
      let fogFactor: f32 = smoothstep( params.fogNear, params.fogFar, distanceToCamera );

      let scalar: f32 = fogFactor * fogDensity;
      let fog: f32 = 1.0 - exp(-(scalar * scalar));

      color = mix(color, fogColor, fog);

      // color = mix( color, vec4(colors.fog, 1.0), fogFactor );
      // color.rgb = vec3(depth);
    }

    if(debug.debugZoom == 1) {
      color.rgb = vec3(f32(tile.current[2].element) / 20.0, f32(debug.elevationZoom) / 20.0, 0.0);
    }

    if(debug.elevation == 1) {
      let elevation = fsInput.elevation / 9000.0;
      color.rgb = vec3(elevation);
    }

    color.a *= params.globalOpacity;

    return color;
  }
`
