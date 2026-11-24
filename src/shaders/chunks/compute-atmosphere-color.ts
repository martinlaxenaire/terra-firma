export const computeAtmosphereColor = /* wgsl */ `
  fn computeAtmosphereColor(
    positionWC: vec3f,
    lightDirection: vec3f,
    rayleighColor: vec3f,
    mieColor: vec3f,
    opacity: f32
  ) -> vec3f {
      let cameraToPositionWC: vec3f = positionWC - czm_viewerPositionWC;
      let cameraToPositionWCDirection: vec3f = normalize(cameraToPositionWC);
      let cosAngle: f32 = dot(cameraToPositionWCDirection, lightDirection);
      let cosAngleSq: f32 = cosAngle * cosAngle;
      let G: f32 = u_atmosphereMieAnisotropy;
      let GSq: f32 = G * G;
      let rayleighPhase: f32 = 3.0 / (50.2654824574) * (1.0 + cosAngleSq);
      let miePhase: f32 = 3.0 / (25.1327412287) * ((1.0 - GSq) * (cosAngleSq + 1.0)) / (pow(1.0 + GSq - 2.0 * cosAngle * G, 1.5) * (2.0 + GSq));
      let rayleigh: vec3f = rayleighPhase * rayleighColor;
      let mie: vec3f = miePhase * mieColor;
      let color: vec3f = (rayleigh + mie) * u_atmosphereLightIntensity;
      return vec4(color, opacity);
  }`
