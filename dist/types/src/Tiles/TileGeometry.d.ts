import { Geometry, PlaneGeometry, VertexBufferAttributeParams } from 'gpu-curtains';
export declare class TileGeometry extends PlaneGeometry {
    constructor({ widthSegments, heightSegments, instancesCount, vertexBuffers }?: {
        heightSegments?: number | undefined;
        instancesCount?: number | undefined;
        vertexBuffers?: never[] | undefined;
        widthSegments?: number | undefined;
    });
    /**
     * Return terrain boundary indices in perimeter order.
     * Each corner appears exactly once.
     *
     * Grid coordinates:
     *   x increases from left to right in grid-index space.
     *   y increases from top to bottom in grid-index space.
     */
    getPerimeterIndices(): number[];
    getIndexedVerticesAndUVs(verticesCount: Geometry['verticesCount']): Record<string, VertexBufferAttributeParams>;
    setIndexArray(): void;
}
