export const elevationHelpers = /* wgsl */ `
  fn getHypsoElevation(c: vec3f) -> f32 {
      let isGrayscale =
          abs(c.r - c.g) < 0.001 &&
          abs(c.g - c.b) < 0.001;

      if (isGrayscale) {
          return 5100.0 +
              3400.0 *
              (c.r - (185.0 / 255.0)) /
              (1.0 - (185.0 / 255.0));
      }

      return 5000.0;
  }

  fn getElevation(elevationMap: vec4f) -> f32 {
    if(params.elevationMapEncoding == 2) {
      // hypso
      // https://gibs.earthdata.nasa.gov/colormaps/v1.0/ASTER_GDEM_Color_Index.xml
      return getHypsoElevation(elevationMap.rgb);
    } else if(params.elevationMapEncoding == 1) {
      // amazon & lerc terrarium
      // https://github.com/tilezen/joerd/blob/master/docs/formats.md
      return (elevationMap.r * 255.0 * 256.0 + elevationMap.g * 255.0 + elevationMap.b * 255.0 / 256.0) - 32768.0;
    }
    else {
      // maptiles, mapbox DEM
      return -10000.0 + ((elevationMap.r * 255.0 * 256.0 * 256.0 + elevationMap.g * 255.0 * 256.0 + elevationMap.b * 255.0) * 0.1);
    }
  }
`
