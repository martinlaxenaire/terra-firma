// decoding
import * as Lerc from 'lerc'
import * as tilebelt from '@mapbox/tilebelt'
import { TileSource, tilesSourcesCache } from '../caches/tiles-sources-cache.js'
import { getRGBFromAltitudeEncoding, analyzeElevationFromCanvas, analyzeElevationImage } from '../utils/map.js'
import { ElevationProvider, SatelliteProvider } from '../types/providers.js'
import { TileElevationMetadata, tilesElevationsCache } from '../caches/tiles-elevations-cache.js'
import { TileType } from '../types/caches.js'
import type { MediaTexture } from 'gpu-curtains'
import { LercWorkerPool } from '../WorkerPool/LercWorkerPool.js'

export type FetchTileResponse = { source: ImageBitmap | HTMLImageElement | ArrayBuffer; valid: boolean }

export interface FetchTileOptions {
  url: string
  type: ElevationProvider['type']
  encoding?: ElevationProvider['encoding']
}

export interface GetRasterTileOptions {
  tile: tilebelt.Tile
  tileType: TileType
  provider: ElevationProvider | SatelliteProvider
  useWorkers?: boolean
}

export interface GetRasterTile {
  source: TileSource
  metadata: TileElevationMetadata | undefined
  valid: boolean
}

export interface SetTileTextureOptions extends GetRasterTileOptions {
  texture: MediaTexture
}

export const tilesAPI = {
  supportOffscreenCanvas: typeof OffscreenCanvas !== 'undefined',

  lercPool: new LercWorkerPool(),

  createEmptyImageData(size = 256, encoding: ElevationProvider['encoding'] | undefined): ImageData {
    const data = new Uint8Array(size * size * 4)

    const { r, g, b } = getRGBFromAltitudeEncoding(0, encoding)

    for (let i = 0; i < data.length; i += 4) {
      data[i] = r // R
      data[i + 1] = g // G
      data[i + 2] = b // B
      data[i + 3] = 255 // A
    }

    return new ImageData(new Uint8ClampedArray(data.buffer), size, size)
  },

  async createEmptyTile(size = 256, encoding: ElevationProvider['encoding'] | undefined): Promise<ImageBitmap> {
    const imageData = this.createEmptyImageData(size, encoding)

    return createImageBitmap(imageData)
  },

  // Inside your tile handler
  async processLercRasterTile(rasterTile: ArrayBuffer): Promise<{ source: ImageData; valid: boolean }> {
    // Note: rasterTile is transferred, so do not read from it after this call
    try {
      const lercImageData = await this.lercPool.decodeTile(rasterTile)

      if (lercImageData) {
        return { source: lercImageData, valid: true }
      } else {
        return { source: this.createEmptyImageData(257, 'terrarium'), valid: false }
      }
    } catch {
      return { source: this.createEmptyImageData(257, 'terrarium'), valid: false }
    }
  },

  async fetchTile({ url = '', type = 'image', encoding = undefined }: FetchTileOptions): Promise<FetchTileResponse> {
    try {
      const response = await fetch(url)

      if (type === 'image') {
        const imageBlob = await response.blob()

        let source: HTMLImageElement | ImageBitmap = await new Promise((resolve, reject) => {
          const image = new Image()
          const objectURL = URL.createObjectURL(imageBlob)

          image.onload = () => {
            URL.revokeObjectURL(objectURL)
            resolve(image)
          }

          image.onerror = () => {
            URL.revokeObjectURL(objectURL)
            reject(() => this.createEmptyTile(256, encoding))
          }

          image.src = objectURL
        })

        return {
          source: source,
          valid: true,
        }
      } else if (type === 'lerc') {
        const source = await response.arrayBuffer()
        return {
          source,
          valid: true,
        }
      }
    } catch (e) {
      const source = await this.createEmptyTile(256, encoding)
      return { source, valid: false }
    }
  },

  async fetchTileFromWorker({
    url = '',
    type = 'image',
    encoding = undefined,
  }: FetchTileOptions): Promise<FetchTileResponse> {
    let worker: Worker | undefined

    try {
      const tile: Blob | ArrayBuffer = await new Promise((resolve, reject) => {
        worker = new Worker('./workers/fetch-tile-worker.js')

        worker.addEventListener(
          'message',
          (e) => {
            if (e.data?.error) {
              reject(new Error(e.data.error))
            } else {
              resolve(e.data)
            }
          },
          { once: true },
        )

        worker.addEventListener(
          'error',
          (e) => {
            reject(e.error || new Error(e.message))
          },
          { once: true },
        )

        worker.postMessage({ url, type })
      })

      if (type === 'image') {
        let source: HTMLImageElement | ImageBitmap = await new Promise((resolve, reject) => {
          const image = new Image()
          const objectURL = URL.createObjectURL(tile as Blob)

          image.onload = () => {
            URL.revokeObjectURL(objectURL)
            resolve(image)
          }

          image.onerror = () => {
            URL.revokeObjectURL(objectURL)
            reject(() => this.createEmptyTile(256, encoding))
          }

          image.src = objectURL
        })

        return {
          source: source,
          valid: true,
        }
      }

      if (type === 'lerc') {
        return { source: tile as ArrayBuffer, valid: true }
      }

      throw new Error(`Unsupported tile type: ${type}`)
    } catch (e) {
      console.warn('Tile loading failed:', e, url)
      const source = await this.createEmptyTile(256, encoding)
      return { source, valid: false }
    } finally {
      worker?.terminate()
    }
  },

  async getRasterTile({
    tile = [0, 0, 10],
    tileType = 'elevation',
    provider,
    useWorkers = true,
  }: GetRasterTileOptions): Promise<GetRasterTile | undefined> {
    const tileSource = tilesSourcesCache.getSource({
      tile,
      type: tileType,
      provider,
    })

    let metadata = tilesElevationsCache.getSource(tile)

    if (tileSource) {
      return { source: tileSource.source, metadata, valid: true }
    }

    const { type, key } = provider
    const encoding = 'encoding' in provider ? provider.encoding : undefined

    let currentEncoding = tileType === 'satellite' ? undefined : (encoding as ElevationProvider['encoding'])

    const url = provider.getTile(tile, key ?? '')
    const rasterTile = useWorkers
      ? await this.fetchTileFromWorker({ url, type, encoding: currentEncoding })
      : await this.fetchTile({ url, type, encoding: currentEncoding })

    if (type === 'image') {
      const imageRasterTile = rasterTile.source as HTMLImageElement | ImageBitmap

      if (rasterTile.valid) {
        tilesSourcesCache.addSource({
          tile,
          type: encoding ? 'elevation' : 'satellite',
          provider,
          source: imageRasterTile,
          url,
        })

        if (tileType === 'elevation') {
          metadata = analyzeElevationImage(imageRasterTile as HTMLImageElement | ImageBitmap, currentEncoding)
          tilesElevationsCache.addSource({ tile, elevation: metadata })
        }
      }

      return { source: imageRasterTile, metadata, valid: rasterTile.valid }
    } else if (type === 'lerc') {
      // arbitrary lerc data size
      const size = 257

      const canvas = this.supportOffscreenCanvas ? new OffscreenCanvas(size, size) : document.createElement('canvas')
      const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null

      canvas.width = size
      canvas.height = size

      if (!ctx) {
        return { source: canvas, metadata, valid: false }
      }

      const { source: lercImageData, valid } = await this.processLercRasterTile(rasterTile.source as ArrayBuffer)

      if (valid) {
        ctx.putImageData(lercImageData, 0, 0)

        tilesSourcesCache.addSource({
          tile,
          type: tileType,
          provider,
          source: canvas,
          url,
        })

        if (tileType === 'elevation') {
          metadata = analyzeElevationFromCanvas(canvas, ctx, encoding)
          tilesElevationsCache.addSource({ tile, elevation: metadata })
        }
      }

      return { source: canvas, metadata, valid }
    }
  },

  async setTileTexture({
    texture,
    tile = [0, 0, 10],
    tileType = 'elevation',
    provider,
    useWorkers = true,
  }: SetTileTextureOptions): Promise<GetRasterTile | undefined> {
    if (!provider) {
      console.warn('No provider provided, cannot fetch tile')
      return
    }

    const rasterTile = await this.getRasterTile({ tile, tileType, provider, useWorkers })

    if (rasterTile?.source) {
      if (rasterTile.source instanceof HTMLImageElement) {
        texture.useImageBitmap(rasterTile.source as unknown as ImageBitmap)
      } else {
        texture.loadCanvas(rasterTile.source as HTMLCanvasElement)
      }
    }

    return rasterTile
  },

  destroy() {},
}
