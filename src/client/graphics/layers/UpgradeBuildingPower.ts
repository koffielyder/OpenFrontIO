import { UnitType } from "../../../core/game/Game";
import { GameView, UnitView } from "../../../core/game/GameView";
import {
  getResourceTypeAtTile,
  resourceSeedKeyFromGameConfig,
  ResourceType,
} from "../../../core/game/ResourceNodes";

type UpgradePowerTickCache = {
  tick: number;
  stationComponents: UnitView[][] | null;
  activeLevelsByKey: Map<string, number>;
};

const upgradePowerCache = new WeakMap<GameView, UpgradePowerTickCache>();

function tickCache(game: GameView): UpgradePowerTickCache {
  const currentTick = game.ticks();
  const existing = upgradePowerCache.get(game);
  if (existing !== undefined && existing.tick === currentTick) {
    return existing;
  }

  const created: UpgradePowerTickCache = {
    tick: currentTick,
    stationComponents: null,
    activeLevelsByKey: new Map<string, number>(),
  };
  upgradePowerCache.set(game, created);
  return created;
}

function activeLevelsFromResource(
  levels: number,
  availableResource: number,
): number {
  let activeLevels = 0;
  let requiredForNextLevel = 1;

  while (activeLevels < levels && availableResource >= requiredForNextLevel) {
    availableResource -= requiredForNextLevel;
    activeLevels++;
    requiredForNextLevel *= 2;
  }

  return activeLevels;
}

function stationComponents(game: GameView): UnitView[][] {
  const cache = tickCache(game);
  if (cache.stationComponents !== null) {
    return cache.stationComponents;
  }

  const stations = game
    .units(
      UnitType.City,
      UnitType.Factory,
      UnitType.Port,
      UnitType.Extractor,
      UnitType.Barracks,
      UnitType.DefenseDepartment,
      UnitType.WarDepartment,
      UnitType.NuclearFacility,
    )
    .filter((unit) => unit.isActive());

  const stationById = new Map<number, UnitView>();
  for (const station of stations) {
    stationById.set(station.id(), station);
  }

  const maxRange = game.config().trainStationMaxRange();
  const minRangeSquared = game.config().trainStationMinRange() ** 2;
  const neighborsById = new Map<number, number[]>();

  for (const station of stations) {
    const neighbors = game
      .nearbyUnits(station.tile(), maxRange, [
        UnitType.City,
        UnitType.Factory,
        UnitType.Port,
        UnitType.Extractor,
        UnitType.Barracks,
        UnitType.DefenseDepartment,
        UnitType.WarDepartment,
        UnitType.NuclearFacility,
      ])
      .filter(
        ({ unit, distSquared }) =>
          unit.id() !== station.id() && distSquared > minRangeSquared,
      )
      .map(({ unit }) => unit.id());
    neighborsById.set(station.id(), neighbors);
  }

  const components: UnitView[][] = [];
  const visited = new Set<number>();
  for (const station of stations) {
    const startId = station.id();
    if (visited.has(startId)) {
      continue;
    }

    const stack = [startId];
    visited.add(startId);
    const component: UnitView[] = [];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      const currentStation = stationById.get(currentId);
      if (currentStation !== undefined) {
        component.push(currentStation);
      }

      const neighbors = neighborsById.get(currentId) ?? [];
      for (const nextId of neighbors) {
        if (!visited.has(nextId) && stationById.has(nextId)) {
          visited.add(nextId);
          stack.push(nextId);
        }
      }
    }

    components.push(component);
  }

  cache.stationComponents = components;
  return components;
}

function activeUpgradeLevelsForPlayer(
  game: GameView,
  playerId: string,
  buildingType: UnitType,
  resourceType: ResourceType,
): number {
  const cache = tickCache(game);
  const key = `${playerId}|${buildingType}|${resourceType}`;
  const cachedValue = cache.activeLevelsByKey.get(key);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const seedKey = resourceSeedKeyFromGameConfig(game.config().gameConfig());
  let totalActiveLevels = 0;

  for (const componentStations of stationComponents(game)) {
    const buildingLevels = componentStations
      .filter(
        (station) =>
          station.type() === buildingType && station.owner().id() === playerId,
      )
      .reduce((sum, station) => sum + station.level(), 0);

    let resourceCapacity = 0;
    for (const station of componentStations) {
      if (
        station.type() !== UnitType.Extractor ||
        station.owner().id() !== playerId
      ) {
        continue;
      }

      const resource = getResourceTypeAtTile(game, seedKey, station.tile());
      if (resource === resourceType) {
        resourceCapacity += station.level();
      }
    }

    totalActiveLevels += activeLevelsFromResource(
      buildingLevels,
      resourceCapacity,
    );
  }

  cache.activeLevelsByKey.set(key, totalActiveLevels);
  return totalActiveLevels;
}

export function activeBarracksLevelsForPlayer(
  game: GameView,
  playerId: string,
): number {
  return activeUpgradeLevelsForPlayer(
    game,
    playerId,
    UnitType.Barracks,
    ResourceType.Grain,
  );
}

export function activeDefenseDepartmentLevelsForPlayer(
  game: GameView,
  playerId: string,
): number {
  return activeUpgradeLevelsForPlayer(
    game,
    playerId,
    UnitType.DefenseDepartment,
    ResourceType.Stone,
  );
}

export function activeNuclearFacilityLevelsForPlayer(
  game: GameView,
  playerId: string,
): number {
  return activeUpgradeLevelsForPlayer(
    game,
    playerId,
    UnitType.NuclearFacility,
    ResourceType.Ore,
  );
}

export function activeWarDepartmentLevelsForPlayer(
  game: GameView,
  playerId: string,
): number {
  const seedKey = resourceSeedKeyFromGameConfig(game.config().gameConfig());
  let totalActiveLevels = 0;

  for (const componentStations of stationComponents(game)) {
    const oreCapacity = componentStations
      .filter(
        (station) =>
          station.type() === UnitType.Extractor &&
          station.owner().id() === playerId,
      )
      .reduce((sum, station) => {
        const resource = getResourceTypeAtTile(game, seedKey, station.tile());
        return resource === ResourceType.Ore ? sum + station.level() : sum;
      }, 0);

    const nuclearFacilityLevels = componentStations
      .filter(
        (station) =>
          station.type() === UnitType.NuclearFacility &&
          station.owner().id() === playerId,
      )
      .reduce((sum, station) => sum + station.level(), 0);

    const warDepartmentLevels = componentStations
      .filter(
        (station) =>
          station.type() === UnitType.WarDepartment &&
          station.owner().id() === playerId,
      )
      .reduce((sum, station) => sum + station.level(), 0);

    const oreUsedByNuclearFacilities = resourceUsedForPoweredLevels(
      nuclearFacilityLevels,
      oreCapacity,
    );
    const oreLeftForWarDepartment = Math.max(
      0,
      oreCapacity - oreUsedByNuclearFacilities,
    );

    totalActiveLevels += activeLevelsFromResource(
      warDepartmentLevels,
      oreLeftForWarDepartment,
    );
  }

  return totalActiveLevels;
}

function resourceUsedForPoweredLevels(
  levels: number,
  availableResource: number,
): number {
  let activeLevels = 0;
  let resourceUsed = 0;
  let requiredForNextLevel = 1;

  while (activeLevels < levels && availableResource >= requiredForNextLevel) {
    availableResource -= requiredForNextLevel;
    resourceUsed += requiredForNextLevel;
    activeLevels++;
    requiredForNextLevel *= 2;
  }

  return resourceUsed;
}
