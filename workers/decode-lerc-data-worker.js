import * as Lerc from 'lerc'
import lercWasmUrl from 'lerc/lerc-wasm.wasm?url'

// Initialize the WASM module once per worker instance
const lercReady = Lerc.load({
  locateFile: () => lercWasmUrl,
})

self.onmessage = async (e) => {
  const { id, rasterTile } = e.data

  try {
    await lercReady

    if (!rasterTile || rasterTile.byteLength === 0) {
      throw new Error(`Empty rasterTile buffer (byteLength: ${rasterTile?.byteLength})`)
    }

    // 1. Decode LERC off the main thread
    const pixelBlock = Lerc.decode(rasterTile)
    const { height, width, pixels, mask, noDataValues } = pixelBlock
    const band = pixels[0]

    if (!band || band.length !== width * height) {
      throw new Error('Missing or invalid LERC pixel band')
    }

    if (noDataValues) {
      throw new Error('No data values for LERC tile')
    }

    const rgbaBuffer = new Uint8ClampedArray(width * height * 4)
    let validPixelCount = 0

    for (let i = 0; i < band.length; i++) {
      const rawVal = band[i]

      // mask[i] === 1 means valid data (including valid 0m sea level or negative bathymetry)
      // mask[i] === 0 means noData / unpopulated pixel
      const isMaskedOut = mask && mask[i] === 0
      const isNoData =
        rawVal === undefined || Number.isNaN(rawVal) || (noDataValues !== null && rawVal === noDataValues)

      const isValid = !isMaskedOut && !isNoData
      const altitude = isValid ? rawVal : 0

      if (isValid) {
        validPixelCount++
      }

      const offset = i * 4
      const value = altitude + 32768
      rgbaBuffer[offset] = Math.floor(value / 256)
      rgbaBuffer[offset + 1] = Math.floor(value % 256)
      rgbaBuffer[offset + 2] = Math.floor((value - Math.floor(value)) * 256)
      rgbaBuffer[offset + 3] = isValid ? 255 : 0
    }

    // 2. Only reject if ALL pixels are masked out (noData)
    if (validPixelCount === 0) {
      self.postMessage({ id, status: 'empty' })
      return
    }

    // 3. Transfer the buffer ownership back (zero-copy)
    self.postMessage({ id, status: 'ok', buffer: rgbaBuffer.buffer, width, height }, [rgbaBuffer.buffer])
  } catch (error) {
    console.error(`[LERC Worker] Task ${id} failed:`, error)
    self.postMessage({ id, status: 'error', error: error.message })
  }
}
