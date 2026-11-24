import { FullscreenPlane, GPUCameraRenderer, Vec3 } from 'gpu-curtains';
export declare class Sky {
    renderer: GPUCameraRenderer;
    camera: GPUCameraRenderer['camera'];
    sunPosition: Vec3;
    mesh: FullscreenPlane;
    constructor({ renderer, camera, sunPosition, }: {
        renderer: GPUCameraRenderer;
        camera: GPUCameraRenderer['camera'];
        sunPosition?: Vec3;
    });
    updateCameraProjection(): void;
    destroy(): void;
}
