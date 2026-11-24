import * as tilebelt from '@mapbox/tilebelt';
import type { GeographicBounds, GlobeCoordinates, GeographicCoordinates, XYZCoordinates, TileGeographicCoordinates, GlobeOffset } from '../types/geographic.js';
import { Vec3 } from 'gpu-curtains';
/**
 * Convert longitude/latitude in degrees to fractional XYZ tile
 * coordinates at a given zoom.
 *
 * x and y can be fractional, so this works for points as well as
 * integer tile coordinates.
 */
export declare function lonLatToTile(point: TileGeographicCoordinates): XYZCoordinates;
/**
 * Convert fractional XYZ tile coordinates to longitude/latitude.
 *
 * For a tile's northwest corner, pass its integer x and y.
 * For its center, pass x + 0.5 and y + 0.5.
 */
export declare function tileToLonLat([x, y, z]: tilebelt.Tile): GeographicCoordinates;
/**
 * Geographic bounds of an XYZ tile.
 * Returns west, south, east, north in degrees.
 */
export declare function getTileBounds([x, y, z]: tilebelt.Tile): GeographicBounds;
export declare function getTileCenter([x, y, z]: tilebelt.Tile): GeographicCoordinates;
/**
 * Convert longitude/latitude/elevation to a spherical Earth position.
 *
 * Coordinate convention:
 *   +Y = North Pole
 *   +Z = longitude 0°
 *   +X = longitude 90° East
 *
 * Elevation is in metres.
 */
export declare function lonLatToWorld(point: GeographicCoordinates, elevation?: number, radius?: number): XYZCoordinates;
/**
 * Convert a spherical Earth position back to longitude,
 * latitude and elevation.
 *
 * Assumes the same spherical coordinate convention as above.
 */
export declare function worldToLonLat({ x, y, z }: XYZCoordinates, radius?: number): GlobeCoordinates;
/**
 * Convert a geographic offset into a spherical Earth position.
 *
 * north: latitude in degrees
 * west: longitude in degrees
 * altitude: elevation above the Earth's surface, in meters
 */
export declare function offsetToWorld({ north, west, altitude }: GlobeOffset, radius?: number): Vec3;
/**
 * Convert local geographic offsets (in meters) into a world-space
 * displacement vector at a given longitude/latitude.
 */
export declare function lonLatOffsetToWorld({ north, west, altitude }: GlobeOffset, { longitude, latitude }: GeographicCoordinates): Vec3;
/**
 * Local tangent frame at a geographic position.
 *
 * east:  direction of increasing longitude
 * north: direction of increasing latitude
 * up:    radial direction away from Earth's center
 */
export declare function getLocalFrame(point: GeographicCoordinates): {
    east: {
        x: number;
        y: number;
        z: number;
    };
    north: {
        x: number;
        y: number;
        z: number;
    };
    up: {
        x: number;
        y: number;
        z: number;
    };
};
/**
 * Calculate spherial distance between two coordinates.
 * Returns distance in meters.
 */
export declare function getSphericalDistance(pointA: GeographicCoordinates, pointB: GeographicCoordinates, radius?: number): number;
export declare function getSphericalDistanceFromVec3(pointA: Vec3, pointB: Vec3, center?: Vec3, radius?: number): number;
/**
 * Get a tile's center in world coordinates and its local orientation frame.
 *
 * The returned frame is useful for positioning/orienting a tile locally.
 * It does not itself create a gpu-curtains Object3D or quaternion.
 */
export declare function getTileTransform(tile: tilebelt.Tile, elevation?: number, radius?: number): {
    position: XYZCoordinates;
    rotation: {
        east: {
            x: number;
            y: number;
            z: number;
        };
        north: {
            x: number;
            y: number;
            z: number;
        };
        up: {
            x: number;
            y: number;
            z: number;
        };
    };
    center: GeographicCoordinates;
};
/**
 * Convert Mercator latitude into spherical latitude.
 * Must match the WGSL implementation.
 */
export declare function mercatorToGlobeLatitude(mercatorLat: number): number;
/**
 * Convert spherical latitude back into Mercator latitude.
 *
 * Uses binary search because the polar remapping is monotonic.
 */
export declare function globeToMercatorLatitude(globeLat: number): number;
