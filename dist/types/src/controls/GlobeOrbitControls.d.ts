import { Vec3, PerspectiveCamera, OrthographicCamera } from 'gpu-curtains';
type Camera = PerspectiveCamera | OrthographicCamera;
/** Defines the base parameters used to set / reset GlobeOrbitControls. */
export interface OrbitControlsBaseParams {
    /** The focus point of the controls. */
    target?: Vec3;
    targetElevation?: number;
    /** Whether to allow zooming. */
    enableZoom?: boolean;
    /** Minimum camera distance from target. */
    minZoom?: number;
    /** Maximum camera distance from target. */
    maxZoom?: number;
    /** Zoom speed. */
    zoomSpeed?: number;
    /** Whether to allow rotating. */
    enableRotate?: boolean;
    /** Minimum vertical rotation angle for Ctrl-orbit. */
    minPolarAngle?: number;
    /** Maximum vertical rotation angle for Ctrl-orbit. */
    maxPolarAngle?: number;
    /** Minimum horizontal rotation angle for Ctrl-orbit. */
    minAzimuthAngle?: number;
    /** Maximum horizontal rotation angle for Ctrl-orbit. */
    maxAzimuthAngle?: number;
    /** Rotation speed. */
    rotateSpeed?: number;
    /** Up vector used for camera lookAt computations. */
    up?: Vec3;
    /** Whether to allow panning. */
    enablePan?: boolean;
    /** Pan speed. */
    panSpeed?: number;
}
export interface OrbitControlsParams extends OrbitControlsBaseParams {
    camera?: Camera;
    element?: HTMLElement | Window;
}
export declare class GlobeOrbitControls {
    #private;
    /** Camera controlled by this instance. */
    camera: Camera;
    /** Camera lookAt point / current POI. */
    target: Vec3;
    /**
     * Centre of the Earth.
     *
     * Normal left-drag rotates both camera and target around this point.
     * It is normally the world origin.
     */
    globeTarget: Vec3;
    enabled: boolean;
    enableZoom: boolean;
    maxZoom: number;
    zoomSpeed: number;
    /** Current target estimated elevation. */
    targetElevation: number;
    enableRotate: boolean;
    minPolarAngle: number;
    maxPolarAngle: number;
    minAzimuthAngle: number;
    maxAzimuthAngle: number;
    rotateSpeed: number;
    up: Vec3;
    enablePan: boolean;
    panSpeed: number;
    constructor({ camera, element, target, targetElevation, enableZoom, minZoom, maxZoom, zoomSpeed, enableRotate, minPolarAngle, maxPolarAngle, minAzimuthAngle, maxAzimuthAngle, rotateSpeed, up, enablePan, panSpeed, }: OrbitControlsParams);
    /**
     * Set or replace the controlled camera.
     */
    useCamera(camera: Camera): void;
    get minZoom(): number;
    set minZoom(minZoom: number);
    /**
     * Reset the controls.
     */
    reset({ position, target, targetElevation, enableZoom, minZoom, maxZoom, zoomSpeed, enableRotate, minPolarAngle, maxPolarAngle, minAzimuthAngle, maxAzimuthAngle, rotateSpeed, up, enablePan, panSpeed, }?: {
        position?: Vec3;
    } & OrbitControlsBaseParams): void;
    /**
     * Override the camera position.
     */
    updatePosition(position?: Vec3): void;
    set element(value: HTMLElement | Window | null);
    get element(): HTMLElement | Window | null;
    setCurrentElevation(elevation: number | undefined): void;
    /**
     * Cancel a running `flyTo` animation.
     */
    cancelFlyTo(): void;
    /**
     * Animate camera around the globe toward a new position and target,
     * with a zoom arc proportionnal to the spherical distance.
     */
    flyTo({ position: newPosition, target: newTarget, duration, minDuration, maxDuration, ease, onComplete, }: {
        position: Vec3;
        target: Vec3;
        duration?: number;
        minDuration?: number;
        maxDuration?: number;
        ease?: string;
        onComplete?: () => void;
    }): gsap.core.Tween;
    /**
     * Remove event listeners.
     */
    destroy(): void;
}
export {};
