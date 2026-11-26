export const getVertexAerialPerspective = /* wgsl */ `
  if (features.useFog == 1) {
      let toVertex = vsOutput.worldPosition - camera.position;
      let distanceToVertex = length(toVertex);
      let rayDirection = toVertex / max(distanceToVertex, 0.0001);
      let sunDir = normalize(globe.sunPosition);

      // No need for screen-space jitter when smoothly interpolated across triangles!
      let aerial = calculateAerialPerspective(
          camera.position,
          rayDirection,
          distanceToVertex,
          sunDir,
          globe.earthRadius,
          0.0,
          4u,
          false
      );

      vsOutput.aerialInScattering = aerial.inScattering;
      vsOutput.aerialTransmittance = aerial.transmittance;
  } else {
      vsOutput.aerialInScattering = vec3f(0.0);
      vsOutput.aerialTransmittance = vec3f(1.0);
  }
  `
