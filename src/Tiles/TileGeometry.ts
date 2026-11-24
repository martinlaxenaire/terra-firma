import { PlaneGeometry } from 'gpu-curtains'

export class TileGeometry extends PlaneGeometry {
  constructor({ widthSegments = 1, heightSegments = 1, instancesCount = 1, vertexBuffers = [] } = {}) {
    if (
      !Number.isInteger(widthSegments) ||
      !Number.isInteger(heightSegments) ||
      widthSegments < 1 ||
      heightSegments < 1
    ) {
      throw new Error('TileGeometry widthSegments and heightSegments must be positive integers.')
    }

    super({
      widthSegments,
      heightSegments,
      instancesCount,
      vertexBuffers,
    })

    this.type = 'TileGeometry'
  }

  /**
   * Return terrain boundary indices in perimeter order.
   * Each corner appears exactly once.
   *
   * Grid coordinates:
   *   x increases from left to right in grid-index space.
   *   y increases from top to bottom in grid-index space.
   */
  getPerimeterIndices() {
    const width = this.definition.width
    const height = this.definition.height
    const gridWidth = width + 1

    const perimeter = []

    // Top edge: top-left -> top-right.
    for (let x = 0; x <= width; x++) {
      perimeter.push(x)
    }

    // Right edge: below the top-right corner -> bottom-right.
    for (let y = 1; y <= height; y++) {
      perimeter.push(y * gridWidth + width)
    }

    // Bottom edge: below the bottom-right corner -> bottom-left.
    // Exclude the bottom-right corner because it is already included.
    for (let x = width - 1; x >= 0; x--) {
      perimeter.push(height * gridWidth + x)
    }

    // Left edge: above the bottom-left corner -> below top-left.
    // Exclude both corners because they are already included.
    for (let y = height - 1; y >= 1; y--) {
      perimeter.push(y * gridWidth)
    }

    return perimeter
  }

  getIndexedVerticesAndUVs() {
    const width = this.definition.width
    const height = this.definition.height

    const gridWidth = width + 1
    const gridHeight = height + 1
    const gridVertexCount = gridWidth * gridHeight

    const perimeter = this.getPerimeterIndices()
    const perimeterVertexCount = perimeter.length
    const totalVertexCount = gridVertexCount + perimeterVertexCount

    const uv = {
      name: 'uv',
      type: 'vec2f',
      bufferFormat: 'float32x2',
      size: 2,
      array: new Float32Array(totalVertexCount * 2),
    }

    const position = {
      name: 'position',
      type: 'vec3f',
      bufferFormat: 'float32x3',
      size: 3,
      array: new Float32Array(totalVertexCount * 3),
    }

    const normal = {
      name: 'normal',
      type: 'vec3f',
      bufferFormat: 'float32x3',
      size: 3,
      array: new Float32Array(totalVertexCount * 3),
    }

    const skirt = {
      name: 'skirt',
      type: 'f32',
      bufferFormat: 'float32',
      size: 1,
      array: new Float32Array(totalVertexCount),
    }

    const writeVertex = (index: number, xIndex: number, yIndex: number, isSkirt = false) => {
      const offset3 = index * 3
      const offset2 = index * 2

      // Preserve the existing local plane coordinates.
      position.array[offset3] = 1 - (xIndex * 2) / width

      position.array[offset3 + 1] = 0

      position.array[offset3 + 2] = 1 - (yIndex * 2) / height

      // Preserve the UV orientation that works with your textures.
      uv.array[offset2] = 1 - xIndex / width
      uv.array[offset2 + 1] = 1 - yIndex / height

      normal.array[offset3] = 0
      normal.array[offset3 + 1] = 1
      normal.array[offset3 + 2] = 0

      skirt.array[index] = isSkirt ? 1 : 0
    }

    // 1. Create the regular terrain grid.
    for (let y = 0; y <= height; y++) {
      for (let x = 0; x <= width; x++) {
        const index = x + y * gridWidth
        writeVertex(index, x, y)
      }
    }

    // 2. Create one duplicate for each perimeter vertex.
    // No corner is duplicated more than once.
    for (let i = 0; i < perimeter.length; i++) {
      const originalIndex = perimeter[i]

      const xIndex = originalIndex % gridWidth
      const yIndex = Math.floor(originalIndex / gridWidth)

      const duplicateIndex = gridVertexCount + i

      writeVertex(duplicateIndex, xIndex, yIndex, true)
    }

    return { position, uv, normal, skirt }
  }

  setIndexArray() {
    const width = this.definition.width
    const height = this.definition.height

    const gridWidth = width + 1
    const gridVertexCount = gridWidth * (height + 1)

    const perimeter = this.getPerimeterIndices()
    const perimeterCount = perimeter.length

    const terrainIndexCount = width * height * 6

    // One quad per perimeter segment, including the closing segment.
    const skirtIndexCount = perimeterCount * 6

    const totalIndexCount = terrainIndexCount + skirtIndexCount

    const indexArray = this.useUint16IndexArray ? new Uint16Array(totalIndexCount) : new Uint32Array(totalIndexCount)

    let index = 0

    // 1. Terrain triangles.
    // Keep the original grid topology and winding.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const topLeft = x + y * gridWidth
        const topRight = topLeft + 1
        const bottomLeft = topLeft + gridWidth
        const bottomRight = bottomLeft + 1

        indexArray[index++] = topLeft
        indexArray[index++] = bottomLeft
        indexArray[index++] = topRight

        indexArray[index++] = topRight
        indexArray[index++] = bottomLeft
        indexArray[index++] = bottomRight
      }
    }

    // 2. Skirt ring.
    // Connect each perimeter edge to its duplicated,
    // lowered counterpart. Wrap around at the final vertex.
    for (let i = 0; i < perimeterCount; i++) {
      const next = (i + 1) % perimeterCount

      const topA = perimeter[i]
      const topB = perimeter[next]

      const bottomA = gridVertexCount + i
      const bottomB = gridVertexCount + next

      indexArray[index++] = topA
      indexArray[index++] = topB
      indexArray[index++] = bottomA

      indexArray[index++] = topB
      indexArray[index++] = bottomB
      indexArray[index++] = bottomA
    }

    this.setIndexBuffer({
      array: indexArray,
      bufferFormat: this.useUint16IndexArray ? 'uint16' : 'uint32',
    })
  }
}
