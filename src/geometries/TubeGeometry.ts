import { IndexedGeometry, GeometryParams, Vec3 } from 'gpu-curtains'

export interface TubeGeometryParams extends GeometryParams {
  /** Points defining the tube path in world space */
  points: Vec3[]

  /** Number of segments along the path */
  segments?: number

  /** Tube radius */
  radius?: number

  /** Number of segments around the tube cross-section */
  radialSegments?: number

  /** Whether the path should be closed */
  closed?: boolean
}

export class TubeGeometry extends IndexedGeometry {
  points: Vec3[]
  segments: number
  radius: number
  radialSegments: number
  closed: boolean

  constructor({
    points,
    segments = 64,
    radius = 1,
    radialSegments = 8,
    closed = false,
    ...options
  }: TubeGeometryParams) {
    super(options)

    if (!points || points.length < (closed ? 3 : 2)) {
      throw new Error(`TubeGeometry requires at least ${closed ? 3 : 2} points`)
    }

    if (segments < 1 || radialSegments < 3 || radius <= 0) {
      throw new Error('Invalid TubeGeometry parameters')
    }

    this.type = 'TubeGeometry'

    this.points = points.map((point) => point.clone())
    this.segments = Math.floor(segments)
    this.radius = radius
    this.radialSegments = Math.floor(radialSegments)
    this.closed = closed

    // this.computeGeometry()
    this.setIndexedVerticesAndUVs()
  }

  /**
   * Compute the tube vertices, normals, UVs and indices.
   */
  setIndexedVerticesAndUVs() {
    const { points, segments, radius, radialSegments, closed } = this

    const path = this.getPathPoints()
    const frames = this.computeFrames(path)

    const tubularSegments = closed ? segments : segments + 1
    const radialCount = radialSegments + 1

    const vertices = new Float32Array(tubularSegments * radialCount * 3)

    const normals = new Float32Array(vertices.length)

    const uvs = new Float32Array(tubularSegments * radialCount * 2)

    const indices: number[] = []

    const normal = new Vec3()

    // Generate vertices, normals and UVs
    for (let i = 0; i < tubularSegments; i++) {
      const u = i / segments

      const pathPoint = path[i]
      const { normal: frameNormal, binormal } = frames[i]

      for (let j = 0; j <= radialSegments; j++) {
        const v = j / radialSegments
        const angle = v * Math.PI * 2

        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        normal.copy(frameNormal).multiplyScalar(cos).add(binormal.clone().multiplyScalar(sin)).normalize()

        const vertex = pathPoint.clone().add(normal.clone().multiplyScalar(radius))

        const index = i * radialCount + j

        vertices[index * 3] = vertex.x
        vertices[index * 3 + 1] = vertex.y
        vertices[index * 3 + 2] = vertex.z

        normals[index * 3] = normal.x
        normals[index * 3 + 1] = normal.y
        normals[index * 3 + 2] = normal.z

        uvs[index * 2] = u
        uvs[index * 2 + 1] = v
      }
    }

    // Generate indices
    const tubeLength = closed ? segments : segments

    for (let i = 0; i < tubeLength; i++) {
      const nextI = (i + 1) % tubularSegments

      for (let j = 0; j < radialSegments; j++) {
        const a = i * radialCount + j
        const b = nextI * radialCount + j
        const c = a + 1
        const d = b + 1

        // Counter-clockwise winding
        indices.push(a, c, b)
        indices.push(b, c, d)
      }
    }

    const IndexArray = vertices.length / 3 < 65536 ? Uint16Array : Uint32Array

    this.setAttribute({
      name: 'position',
      type: 'vec3f',
      bufferFormat: 'float32x3',
      size: 3,
      array: vertices,
    })

    this.setAttribute({
      name: 'normal',
      type: 'vec3f',
      bufferFormat: 'float32x3',
      size: 3,
      array: normals,
    })

    this.setAttribute({
      name: 'uv',
      type: 'vec2f',
      bufferFormat: 'float32x2',
      size: 2,
      array: uvs,
    })

    this.setIndexBuffer({
      array: new IndexArray(indices),
      bufferFormat: IndexArray === Uint16Array ? 'uint16' : 'uint32',
    })
  }

  /**
   * Get a control point, wrapping around for closed curves
   * and extrapolating for open curves.
   */
  private getControlPoint(index: number): Vec3 {
    const { points, closed } = this
    const count = points.length

    if (closed) {
      return points[((index % count) + count) % count]
    }

    if (index < 0) {
      return points[0].clone().multiplyScalar(2).sub(points[1])
    }

    if (index >= count) {
      return points[count - 1]
        .clone()
        .multiplyScalar(2)
        .sub(points[count - 2])
    }

    return points[index]
  }

  /**
   * Evaluate a centripetal Catmull-Rom spline.
   *
   * alpha = 0.5 gives centripetal interpolation.
   * The resulting curve passes through all control points.
   */
  private getCatmullRomPoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
    const alpha = 0.5
    const epsilon = 0.000001

    const getT = (t: number, p0: Vec3, p1: Vec3) => {
      return t + Math.max(Math.pow(p0.distance(p1), 2 * alpha), epsilon)
    }

    const t0 = 0
    const t1 = getT(t0, p0, p1)
    const t2 = getT(t1, p1, p2)
    const t3 = getT(t2, p2, p3)

    const tValue = t1 + (t2 - t1) * t

    const interpolate = (a: Vec3, b: Vec3, ta: number, tb: number) => {
      return a
        .clone()
        .multiplyScalar((tb - tValue) / (tb - ta))
        .add(b.clone().multiplyScalar((tValue - ta) / (tb - ta)))
    }

    const a1 = interpolate(p0, p1, t0, t1)
    const a2 = interpolate(p1, p2, t1, t2)
    const a3 = interpolate(p2, p3, t2, t3)

    const b1 = a1
      .clone()
      .multiplyScalar((t2 - tValue) / (t2 - t0))
      .add(a2.clone().multiplyScalar((tValue - t0) / (t2 - t0)))

    const b2 = a2
      .clone()
      .multiplyScalar((t3 - tValue) / (t3 - t1))
      .add(a3.clone().multiplyScalar((tValue - t1) / (t3 - t1)))

    return b1.multiplyScalar((t2 - tValue) / (t2 - t1)).add(b2.multiplyScalar((tValue - t1) / (t2 - t1)))
  }

  /**
   * Sample the path using evenly spaced distances.
   */
  //   private getPathPoints(): Vec3[] {
  //     const { points, segments, closed } = this
  //
  //     const controlPoints = [...points]
  //
  //     if (closed) {
  //       controlPoints.push(points[0])
  //     }
  //
  //     const lengths: number[] = [0]
  //     let totalLength = 0
  //
  //     for (let i = 1; i < controlPoints.length; i++) {
  //       totalLength += controlPoints[i].distance(controlPoints[i - 1])
  //       lengths.push(totalLength)
  //     }
  //
  //     if (totalLength === 0) {
  //       throw new Error('TubeGeometry path must have a non-zero length')
  //     }
  //
  //     const result: Vec3[] = []
  //
  //     const count = closed ? segments : segments + 1
  //
  //     for (let i = 0; i < count; i++) {
  //       const distance = (i / segments) * totalLength
  //
  //       let segmentIndex = 0
  //
  //       while (segmentIndex < lengths.length - 2 && lengths[segmentIndex + 1] < distance) {
  //         segmentIndex++
  //       }
  //
  //       const start = controlPoints[segmentIndex]
  //       const end = controlPoints[segmentIndex + 1]
  //
  //       const segmentLength = lengths[segmentIndex + 1] - lengths[segmentIndex]
  //
  //       const alpha = segmentLength > 0 ? (distance - lengths[segmentIndex]) / segmentLength : 0
  //
  //       result.push(start.clone().lerp(end, alpha))
  //     }
  //
  //     return result
  //   }

  /**
   * Sample the Catmull-Rom curve at approximately equal
   * distances along its length.
   */
  private getPathPoints(): Vec3[] {
    const { points, segments, closed } = this

    const curveSegments = closed ? points.length : points.length - 1

    // Increase this for more accurate arc-length sampling.
    const samplesPerSegment = 50

    const lookup: {
      point: Vec3
      distance: number
    }[] = []

    let totalLength = 0
    let previousPoint: Vec3 | null = null

    for (let i = 0; i < curveSegments; i++) {
      const p0 = this.getControlPoint(i - 1)
      const p1 = this.getControlPoint(i)
      const p2 = this.getControlPoint(i + 1)
      const p3 = this.getControlPoint(i + 2)

      const sampleCount = samplesPerSegment

      for (let j = 0; j <= sampleCount; j++) {
        // Avoid duplicating the first sample of each
        // segment except for the very first segment.
        if (i > 0 && j === 0) continue

        const t = j / sampleCount

        const point = this.getCatmullRomPoint(p0, p1, p2, p3, t)

        if (previousPoint) {
          totalLength += point.distance(previousPoint)
        }

        lookup.push({
          point,
          distance: totalLength,
        })

        previousPoint = point
      }
    }

    if (totalLength <= 0) {
      throw new Error('TubeGeometry path must have a non-zero length')
    }

    const result: Vec3[] = []

    const count = closed ? segments : segments + 1

    for (let i = 0; i < count; i++) {
      const targetDistance = (i / segments) * totalLength

      let low = 0
      let high = lookup.length - 1

      // Binary search in the cumulative length lookup.
      while (low < high) {
        const mid = Math.floor((low + high) / 2)

        if (lookup[mid].distance < targetDistance) {
          low = mid + 1
        } else {
          high = mid
        }
      }

      const next = lookup[low]
      const previous = lookup[Math.max(0, low - 1)]

      const distance = next.distance - previous.distance

      const alpha = distance > 0 ? (targetDistance - previous.distance) / distance : 0

      result.push(previous.point.clone().lerp(next.point, alpha))
    }

    return result
  }

  /**
   * Compute parallel-transport frames along the path.
   *
   * Projecting the previous normal onto the new tangent
   * plane avoids most unwanted twisting.
   */
  private computeFrames(path: Vec3[]) {
    const frames: {
      normal: Vec3
      binormal: Vec3
    }[] = []

    const count = path.length
    const tangents: Vec3[] = []

    for (let i = 0; i < count; i++) {
      const previous = path[(i - 1 + count) % count]

      const next = path[(i + 1) % count]

      let tangent: Vec3

      if (!this.closed && i === 0) {
        tangent = next.clone().sub(path[i])
      } else if (!this.closed && i === count - 1) {
        tangent = path[i].clone().sub(previous)
      } else {
        tangent = next.clone().sub(previous)
      }

      tangents.push(tangent.normalize())
    }

    // Pick the least aligned world axis for a stable initial frame
    const firstTangent = tangents[0]

    const reference =
      Math.abs(firstTangent.x) < Math.abs(firstTangent.y)
        ? Math.abs(firstTangent.x) < Math.abs(firstTangent.z)
          ? new Vec3(1, 0, 0)
          : new Vec3(0, 0, 1)
        : Math.abs(firstTangent.y) < Math.abs(firstTangent.z)
          ? new Vec3(0, 1, 0)
          : new Vec3(0, 0, 1)

    let previousNormal = new Vec3().crossVectors(firstTangent, reference).normalize()

    for (let i = 0; i < count; i++) {
      const tangent = tangents[i]

      if (i > 0) {
        // Project the previous normal onto the new tangent plane
        const dot = previousNormal.dot(tangent)

        const projectedNormal = previousNormal.clone().sub(tangent.clone().multiplyScalar(dot))

        if (projectedNormal.lengthSq() > 0.000001) {
          previousNormal = projectedNormal.normalize()
        } else {
          const axis = Math.abs(tangent.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0)

          previousNormal = new Vec3().crossVectors(tangent, axis).normalize()
        }
      }

      const binormal = new Vec3().crossVectors(tangent, previousNormal).normalize()

      frames.push({
        normal: previousNormal.clone(),
        binormal,
      })
    }

    return frames
  }
}
