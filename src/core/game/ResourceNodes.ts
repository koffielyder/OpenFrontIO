import { simpleHash } from "../Util";
import { TerrainType } from "./Game";
import { GameMap, TileRef } from "./GameMap";

const TARGET_ICONS_MIN = 40;
const TARGET_ICONS_MAX = 350;
const LAND_TILES_PER_RESOURCE = 4000;
const CELL_SIZE = 28;
export const RESOURCE_NODE_RADIUS = 3;

export enum ResourceType {
  Ore = "Ore",
  Grain = "Grain",
  Stone = "Stone",
}

export type ResourceNode = {
  tile: TileRef;
  type: ResourceType;
};

type Candidate = {
  tile: TileRef;
  score: number;
  type: ResourceType;
};

const nodesCache = new WeakMap<GameMap, Map<string, ResourceNode[]>>();
const typesCache = new WeakMap<GameMap, Map<string, Map<TileRef, ResourceType>>>();

export function resourceSeedKeyFromGameConfig(gameConfig: {
  gameMap: string;
  gameMapSize: string;
}): string {
  return `${gameConfig.gameMap}:${gameConfig.gameMapSize}`;
}

export function getResourceNodes(map: GameMap, seedKey: string): ResourceNode[] {
  let bySeed = nodesCache.get(map);
  if (bySeed === undefined) {
    bySeed = new Map<string, ResourceNode[]>();
    nodesCache.set(map, bySeed);
  }

  const cached = bySeed.get(seedKey);
  if (cached !== undefined) {
    return cached;
  }

  const generated = generateResourceNodes(map, seedKey);
  bySeed.set(seedKey, generated);
  return generated;
}

export function getResourceTypeAtTile(
  map: GameMap,
  seedKey: string,
  tile: TileRef,
): ResourceType | null {
  let bySeed = typesCache.get(map);
  if (bySeed === undefined) {
    bySeed = new Map<string, Map<TileRef, ResourceType>>();
    typesCache.set(map, bySeed);
  }

  let typeByTile = bySeed.get(seedKey);
  if (typeByTile === undefined) {
    typeByTile = new Map<TileRef, ResourceType>();
    for (const node of getResourceNodes(map, seedKey)) {
      typeByTile.set(node.tile, node.type);
    }
    bySeed.set(seedKey, typeByTile);
  }

  return typeByTile.get(tile) ?? null;
}

export function findResourceNodeNearTile(
  map: GameMap,
  seedKey: string,
  tile: TileRef,
  radius: number = RESOURCE_NODE_RADIUS,
): ResourceNode | null {
  const maxDistSquared = radius * radius;
  let best: ResourceNode | null = null;
  let bestDistSquared = Infinity;

  for (const node of getResourceNodes(map, seedKey)) {
    const distSquared = map.euclideanDistSquared(tile, node.tile);
    if (distSquared > maxDistSquared) {
      continue;
    }
    if (distSquared < bestDistSquared) {
      bestDistSquared = distSquared;
      best = node;
    }
  }

  return best;
}

function generateResourceNodes(map: GameMap, seedKey: string): ResourceNode[] {
  const target = Math.max(
    TARGET_ICONS_MIN,
    Math.min(
      TARGET_ICONS_MAX,
      Math.floor(map.numLandTiles() / LAND_TILES_PER_RESOURCE),
    ),
  );

  const seed = simpleHash(seedKey);
  const byCell = new Map<number, Candidate>();

  map.forEachTile((tile) => {
    if (!map.isLand(tile)) {
      return;
    }

    const resourceType = resourceTypeForTile(map, tile);
    if (resourceType === null) {
      return;
    }

    const x = map.x(tile);
    const y = map.y(tile);
    const cellX = Math.floor(x / CELL_SIZE);
    const cellY = Math.floor(y / CELL_SIZE);
    const cellKey = cellY * 100000 + cellX;
    const score = tileScore(tile, seed);

    const existing = byCell.get(cellKey);
    if (existing === undefined || score < existing.score) {
      byCell.set(cellKey, { tile, score, type: resourceType });
    }
  });

  return Array.from(byCell.values())
    .sort((a, b) => a.score - b.score)
    .slice(0, target)
    .map((candidate) => ({ tile: candidate.tile, type: candidate.type }));
}

function resourceTypeForTile(map: GameMap, tile: TileRef): ResourceType | null {
  switch (map.terrainType(tile)) {
    case TerrainType.Mountain:
      return ResourceType.Ore;
    case TerrainType.Highland:
      return ResourceType.Stone;
    case TerrainType.Plains:
      return ResourceType.Grain;
    default:
      return null;
  }
}

function tileScore(tile: number, seed: number): number {
  let value = tile ^ seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = value ^ (value >>> 16);
  return value >>> 0;
}
