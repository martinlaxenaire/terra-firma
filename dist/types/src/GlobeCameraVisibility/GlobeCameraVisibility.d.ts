import { GPUCameraRenderer, Vec3 } from 'gpu-curtains';
import { GeographicCoordinates } from '../types/geographic.js';
export interface GlobeVisibilityResult {
    cameraPosition: Vec3;
    frustum: Array<Float32Array>;
    intersections: Vec3[];
    footprint: GeographicCoordinates[];
    focalLength: number;
}
export interface GlobeCameraVisibilityBaseOptions {
    edgeSamples?: number;
}
interface GlobeCameraVisibilityInternalOptions {
    onUpdate?: (result: GlobeVisibilityResult) => void;
}
export interface GlobeCameraVisibilityOptions extends GlobeCameraVisibilityBaseOptions, GlobeCameraVisibilityInternalOptions {
}
export declare class GlobeCameraVisibility {
    private readonly camera;
    readonly camera: GPUCameraRenderer['camera'];
    private readonly earthRadius;
    private readonly edgeSamples;
    private readonly onUpdate?;
    private readonly _onMatricesChanged;
    private cameraPosition;
    private _result;
    private lastNear;
    private lastFar;
    private updatingClippingPlanes;
    constructor(camera: GPUCameraRenderer['camera'], options: GlobeCameraVisibilityOptions);
    init(): void;
    get result(): GlobeVisibilityResult;
    get altitude(): number;
    private updateCameraClippingPlanes;
    /**
     * This needs to be called only with fresh camera matrices.
     * @returns
     */
    update(): GlobeVisibilityResult;
    /**
     * Intersect a ray with the Earth sphere.
     *
     * Ray: origin + t * direction
     */
    private intersectSphere;
    /**
     * Convert an ECEF point to longitude and latitude.
     *
     * Convention:
     * - Y is north
     * - longitude 0 is +Z
     * - longitude 90° east is +X
     */
    private toLonLat;
    /**
     * Convert geographic coordinates into normalized XYZ Web Mercator UV.
     *
     * The returned coordinates correspond to the original tile projection,
     * not the distorted spherical projection.
     */
    private toTileUV;
    destroy(): void;
}
export {};
