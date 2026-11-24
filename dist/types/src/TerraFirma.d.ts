import { GPUDeviceManager, GPUCameraRenderer, Vec3, DirectionalLight } from 'gpu-curtains';
import { GlobeOrbitControls } from './controls/GlobeOrbitControls.js';
import TilesManager from './TilesManager/TilesManager.js';
import type { POI, TilesManagerBaseConfig } from './TilesManager/TilesManager.js';
import { TilesProviders } from './types/providers.js';
import { GeographicCoordinates, GlobeOffset } from './types/geographic.js';
import { Sky } from './Sky/Sky.js';
export interface TerraFirmaBaseOptions extends TilesManagerBaseConfig {
    renderer: Omit<GPUCameraRenderer['options'], 'camera' | 'deviceManager' | 'container' | 'autoResize' | 'context' | 'renderPass'>;
}
export interface TerraFirmaOptions extends Omit<TerraFirmaBaseOptions, 'providers'> {
    container: string | HTMLElement;
    poi: POI;
    providers?: TilesProviders;
    useFog?: boolean;
    useSky?: boolean;
    useWorkers?: boolean;
    cameraOffset?: Partial<GlobeOffset>;
    currentDate?: Date;
}
export default class TerraFirma {
    options: NonNullable<TerraFirmaOptions>;
    config: TerraFirmaBaseOptions;
    tilesManager: TilesManager;
    dpr: number;
    deviceManager: GPUDeviceManager;
    renderer: GPUCameraRenderer;
    scene: GPUCameraRenderer['scene'];
    camera: GPUCameraRenderer['camera'];
    orbitControls: GlobeOrbitControls;
    poi: POI;
    fog: {
        color: Vec3;
        near: number;
        far: number;
    };
    sun: DirectionalLight;
    sky: Sky | undefined;
    constructor(options: TerraFirmaOptions);
    init(): Promise<void>;
    setPOI(poi: POI): void;
    updatePOI(poi?: {
        longitude: number;
        latitude: number;
    }, animation?: {
        duration: number;
    } | boolean): void;
    getPointAltitude(point?: GeographicCoordinates, exactAltitude?: boolean): Promise<number>;
    getPoint3DPosition(point?: GeographicCoordinates): Promise<Vec3>;
    setConfig(): void;
    setRenderer(): Promise<void>;
    initTilesManager(): void;
    updateProvider<T extends keyof TilesProviders>(type: T, provider: TilesProviders[T]): Promise<void>;
    getZoomSpeed(altitude: number): number;
    setCameraFromPOI(altitude?: number): void;
    setCamera({ position, target }: {
        position: Vec3;
        target: Vec3;
    }): void;
    /**
     * Calculates real-time Sun position in Earth-Centered Earth-Fixed (ECEF) space
     * mapped to a standard Y-up 3D engine (like gpu-curtains).
     *
     * Coordinate Convention:
     * +Y = North Pole (90° N)
     * +Z = Prime Meridian at Equator (0° N, 0° E)
     * +X = 90° East at Equator (0° N, 90° E)
     */
    getRealTimeSunPositionECEF(position?: Vec3, date?: Date, scaleFactor?: number): Vec3;
    setSky(): void;
    setCurrentDate(date?: Date): void;
    useSunLight(useSunLight?: boolean): void;
    useSunShadows(useSunShadows?: boolean): void;
    useSky(useSky?: boolean): void;
    useFog(useFog?: boolean): void;
    setFog(): void;
    render(): void;
    destroy(): void;
}
