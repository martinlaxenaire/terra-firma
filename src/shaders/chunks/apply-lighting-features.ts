export const declareLightingFeatures = /* wgsl */ `
  let surfaceNormal = normalize(fsInput.normal);
  // 1. Actual outward normal of the Earth at this world position!
  // For tiles this equals radialNormal; for 3D markers it tells us if the marker is on the day or night side of the globe.
  let planetUp = normalize(fsInput.worldPosition);
  let sunDir = normalize(globe.sunPosition);

  // 2. Globe day/night factor based on location on Earth (not the marker's local face normal!)
  let planetSunDot = dot(planetUp, sunDir);
  let dayFactor = smoothstep(-0.16, 0.14, planetSunDot);

  // 3. Local surface lighting (for 3D markers, shades the sphere; for tiles, equals planetSunDot)
  let surfaceSunDot = dot(surfaceNormal, sunDir);

  var finalHillshade = 1.0;
  let exposure = mix(1.2, 1.0, dayFactor);
  `

export const applyLightingFeatures = /* wgsl */ `
  if(features.useSunLight == 1) {
    // 3. Base winter-sun intensity + sunset glow
    let wrapDiffuse = clamp((surfaceSunDot + 0.15) / 1.15, 0.0, 1.0);
    let sunIntensity = mix(0.45, 1.2, pow(wrapDiffuse, 0.75)) * finalHillshade;

    let horizonGlow = exp(-pow((surfaceSunDot + 0.02) * 10.5, 2.0));
    let subtleTint = mix(vec3f(1.0), colors.sunset, horizonGlow * 0.45);

    // 4. Readable cool night side (starlight / moonlight ambient)
    let nightAmbient = outputColor.rgb * colors.nightTint + colors.nightBase;
    let dayLit = max(outputColor.rgb * sunIntensity * subtleTint, nightAmbient * 1.15);

    // Smoothly blend night ambient into day lighting
    outputColor.rgb = mix(nightAmbient, max(dayLit, nightAmbient), dayFactor);
  }

  if(features.useFog == 1) {
    // Tune between 0.25 (crisp map) and 1.0 (full physical haze)
    let hazeStrength = 0.25;
    let nightHazeStrength = 0.5;

    let effectiveHaze = mix(nightHazeStrength, hazeStrength, dayFactor);

    // Blend transmittance toward 1.0 (less attenuation) and scale down inScattering
    let terrainTransmittance = mix(vec3f(1.0), fsInput.aerialTransmittance, effectiveHaze);
    let terrainInScattering = fsInput.aerialInScattering * effectiveHaze;

    outputColor.rgb = outputColor.rgb * terrainTransmittance + terrainInScattering;
  }
  `
