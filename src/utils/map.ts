import * as tilebelt from '@mapbox/tilebelt'
import type { ElevationProvider } from '../types/providers.js'
import type { GeographicCoordinates } from '../types/geographic.js'
import type { TileElevationMetadata } from '../caches/tiles-elevations-cache.js'
import { TileSource } from '../caches/tiles-sources-cache.js'

export const getTileKey = ([x, y, z]: tilebelt.Tile): string => {
  return `${z}/${x}/${y}`
}

export const getTileBBoxCenterCoords = (tileBBox = [0, 0, 0, 0]): GeographicCoordinates => {
  return {
    latitude: (tileBBox[1] + tileBBox[3]) * 0.5,
    longitude: (tileBBox[0] + tileBBox[2]) * 0.5,
  }
}

export const getTileCenterCoords = (tile: tilebelt.Tile = [0, 0, 10]): GeographicCoordinates => {
  const tileBBox = tilebelt.tileToBBOX(tile)
  return getTileBBoxCenterCoords(tileBBox)
}

export const getAllChildren = (tile: tilebelt.Tile, maxZoom: number): tilebelt.Tile[] => {
  if (tile[2] >= maxZoom) return [tile]

  let allChildren: tilebelt.Tile[] = []

  const theChildren = (tile: tilebelt.Tile) => {
    const children = tilebelt.getChildren(tile)

    if (children[0][2] === maxZoom) {
      allChildren = [...allChildren, ...children]
      return
    }

    children.forEach(theChildren)
  }

  theChildren(tile)
  return allChildren
}

export const getParentTileAtZoom = (tile: tilebelt.Tile = [0, 0, 0], zoom = 10): tilebelt.Tile => {
  let parentTile = tile

  while (zoom < parentTile[2]) {
    parentTile = tilebelt.getParent(parentTile)
  }

  return parentTile
}

export const getAltitudeFromRGBEncoding = (
  { r = 0, g = 0, b = 0 },
  encoding: ElevationProvider['encoding'] | undefined = undefined,
) => {
  switch (encoding) {
    case 'terrarium':
      return r * 256 + g + b / 256 - 32768

    case 'dem':
      return -10000 + (r * 65536 + g * 256 + b) * 0.1

    case 'hypso':
      if (r === g && g === b) {
        return 5100 + (3400 * (r / 255 - 185 / 255)) / (1 - 185 / 255)
      }

      return 5000

    default:
      return 0
  }
}

export const getRGBFromAltitudeEncoding = (
  altitude = 0,
  encoding: ElevationProvider['encoding'] | undefined = undefined,
) => {
  switch (encoding) {
    case 'terrarium': {
      const value = altitude + 32768

      const r = Math.floor(value / 256)
      const g = Math.floor(value - r * 256)
      const b = Math.round((value - r * 256 - g) * 256)

      return { r, g, b }
    }

    case 'dem': {
      const value = Math.round((altitude + 10000) * 10)

      const r = Math.floor(value / 65536)
      const g = Math.floor((value - r * 65536) / 256)
      const b = value - r * 65536 - g * 256

      return { r, g, b }
    }

    case 'hypso':
    default:
      // Hypso encoding is a color palette, not a linear elevation encoding.
      // A single altitude cannot be reliably converted back to RGB.
      return { r: 0, g: 0, b: 0 }
  }
}

export const analyzeElevationFromCanvas = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  encoding: ElevationProvider['encoding'] | undefined,
) => {
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)

  let min = Infinity
  let max = -Infinity
  let total = 0
  let count = 0

  for (let i = 0; i < data.length; i += 4) {
    const elevation = getAltitudeFromRGBEncoding(
      {
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
      },
      encoding,
    )

    if (!Number.isFinite(elevation)) continue

    // Not below sea level
    min = Math.max(0, Math.min(min, elevation))
    max = Math.max(max, elevation)
    total += elevation
    count++
  }

  return {
    min,
    max,
    average: count ? total / count : 0,
  }
}

export const analyzeElevationImage = (
  image: HTMLImageElement | ImageBitmap,
  encoding: ElevationProvider['encoding'] | undefined,
): TileElevationMetadata => {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth ?? image.width
  canvas.height = image.naturalHeight ?? image.height

  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  })!

  context.drawImage(image, 0, 0)

  return analyzeElevationFromCanvas(canvas, context, encoding)
}

export const analyzePointElevation = (
  source: TileSource,
  tileFraction: tilebelt.Tile,
  encoding: ElevationProvider['encoding'] | undefined,
): number => {
  let canvas
  let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | undefined

  if (source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas) {
    canvas = source

    context = canvas.getContext('2d', {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  } else {
    canvas = document.createElement('canvas')
    canvas.width = source.naturalWidth ?? source.width
    canvas.height = source.naturalHeight ?? source.height

    context = canvas.getContext('2d', {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

    context.drawImage(source, 0, 0)
  }

  if (!canvas || !context) return 0

  const fraction = [Math.floor(tileFraction[0] * canvas.width), Math.floor(tileFraction[1] * canvas.height)]
  const { data } = context.getImageData(fraction[0], fraction[1], 1, 1)

  if (data.length > 3) {
    return getAltitudeFromRGBEncoding(
      {
        r: data[0],
        g: data[1],
        b: data[2],
      },
      encoding,
    )
  }

  return 0
}
