import { Game, Player, UnitType } from "./Game";
import {
  getResourceTypeAtTile,
  resourceSeedKeyFromGameConfig,
  ResourceType,
} from "./ResourceNodes";

function poweredLevelsAndResourceUsed(
  levels: number,
  availableResource: number,
): { activeLevels: number; resourceUsed: number } {
  let activeLevels = 0;
  let resourceUsed = 0;
  let requiredForNextLevel = 1;

  while (activeLevels < levels && availableResource >= requiredForNextLevel) {
    availableResource -= requiredForNextLevel;
    resourceUsed += requiredForNextLevel;
    activeLevels++;
    requiredForNextLevel *= 2;
  }

  return { activeLevels, resourceUsed };
}

function activeLevelsForUpgradeBuilding(
  game: Game,
  player: Player,
  buildingType: UnitType,
  resourceType: ResourceType,
): number {
  const seedKey = resourceSeedKeyFromGameConfig(game.config().gameConfig());
  const stations = game.railNetwork().stationManager().getAll();

  const processed = new Set<unknown>();
  let totalActiveLevels = 0;

  for (const station of stations) {
    const cluster = station.getCluster();
    if (cluster === null || processed.has(cluster)) {
      continue;
    }
    processed.add(cluster);

    let resourceCapacity = 0;
    let factoryLevels = 0;
    let buildingLevels = 0;

    for (const clusterStation of cluster.stations) {
      if (
        !clusterStation.unit.isActive() ||
        clusterStation.unit.owner() !== player
      ) {
        continue;
      }

      if (clusterStation.unit.type() === UnitType.Factory) {
        factoryLevels += clusterStation.unit.level();
        continue;
      }

      if (clusterStation.unit.type() === buildingType) {
        buildingLevels += clusterStation.unit.level();
        continue;
      }

      if (clusterStation.unit.type() !== UnitType.Extractor) {
        continue;
      }

      const resource = getResourceTypeAtTile(
        game,
        seedKey,
        clusterStation.tile(),
      );
      if (resource === resourceType) {
        resourceCapacity += clusterStation.unit.level();
      }
    }

    const resourceUsedByFactories = Math.min(resourceCapacity, factoryLevels);
    const resourceLeftForBuilding = Math.max(
      0,
      resourceCapacity - resourceUsedByFactories,
    );
    const { activeLevels } = poweredLevelsAndResourceUsed(
      buildingLevels,
      resourceLeftForBuilding,
    );
    totalActiveLevels += activeLevels;
  }

  return totalActiveLevels;
}

export function activeBarracksLevels(game: Game, player: Player): number {
  return activeLevelsForUpgradeBuilding(
    game,
    player,
    UnitType.Barracks,
    ResourceType.Grain,
  );
}

export function activeDefenseDepartmentLevels(
  game: Game,
  player: Player,
): number {
  return activeLevelsForUpgradeBuilding(
    game,
    player,
    UnitType.DefenseDepartment,
    ResourceType.Stone,
  );
}
