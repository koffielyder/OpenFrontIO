import { TrainExecution } from "../execution/TrainExecution";
import { PseudoRandom } from "../PseudoRandom";
import { Game, Player, Unit, UnitType } from "./Game";
import { TileRef } from "./GameMap";
import { GameUpdateType } from "./GameUpdates";
import { Railroad } from "./Railroad";
import {
  getResourceTypeAtTile,
  resourceSeedKeyFromGameConfig,
  ResourceType,
} from "./ResourceNodes";

/**
 * Handle train stops at various station types
 */
interface TrainStopHandler {
  onStop(mg: Game, station: TrainStation, trainExecution: TrainExecution): void;
}

class TradeStationStopHandler implements TrainStopHandler {
  onStop(
    mg: Game,
    station: TrainStation,
    trainExecution: TrainExecution,
  ): void {
    const stationOwner = station.unit.owner();
    const trainOwner = trainExecution.owner();
    const gold = mg.config().trainGold(rel(trainOwner, stationOwner));
    // Share revenue with the station owner if it's not the current player
    if (trainOwner !== stationOwner) {
      stationOwner.addGold(gold, station.tile());
      mg.stats().trainExternalTrade(trainOwner, gold);
    }
    trainOwner.addGold(gold, station.tile());
    mg.stats().trainSelfTrade(trainOwner, gold);

    if (typeof trainExecution.sourceStation !== "function") {
      return;
    }
    if (typeof trainExecution.sourceFactorySlot !== "function") {
      return;
    }

    const sourceStation = trainExecution.sourceStation();
    if (sourceStation.unit.type() !== UnitType.Factory) {
      return;
    }

    const uniqueResources = uniqueExtractorResourcesConnectedToFactory(
      mg,
      sourceStation,
      trainExecution.sourceFactorySlot(),
    );
    if (uniqueResources === 0) {
      return;
    }

    const perResourceBonus = mg.config().trainGold("self") / 2n;
    const bonus =
      perResourceBonus * bonusMultiplierForUniqueResources(uniqueResources);
    if (bonus <= 0n) {
      return;
    }

    trainOwner.addGold(bonus, station.tile());
    mg.stats().trainSelfTrade(trainOwner, bonus);
  }
}

class FactoryStopHandler implements TrainStopHandler {
  onStop(
    mg: Game,
    station: TrainStation,
    trainExecution: TrainExecution,
  ): void {}
}

export function createTrainStopHandlers(
  random: PseudoRandom,
): Partial<Record<UnitType, TrainStopHandler>> {
  return {
    [UnitType.City]: new TradeStationStopHandler(),
    [UnitType.Port]: new TradeStationStopHandler(),
    [UnitType.Factory]: new FactoryStopHandler(),
    [UnitType.Extractor]: new FactoryStopHandler(),
    [UnitType.Barracks]: new FactoryStopHandler(),
    [UnitType.DefenseDepartment]: new FactoryStopHandler(),
    [UnitType.NuclearFacility]: new FactoryStopHandler(),
  };
}

export class TrainStation {
  id: number = -1; // assigned by StationManager
  private readonly stopHandlers: Partial<Record<UnitType, TrainStopHandler>> =
    {};
  private cluster: Cluster | null = null;
  private railroads: Set<Railroad> = new Set();
  // Quick lookup from neighboring station to connecting railroad
  private railroadByNeighbor: Map<TrainStation, Railroad> = new Map();

  constructor(
    private mg: Game,
    public unit: Unit,
  ) {
    this.stopHandlers = createTrainStopHandlers(new PseudoRandom(mg.ticks()));
  }

  tradeAvailable(otherPlayer: Player): boolean {
    const player = this.unit.owner();
    return otherPlayer === player || player.canTrade(otherPlayer);
  }

  clearRailroads() {
    this.railroads.clear();
    this.railroadByNeighbor.clear();
  }

  addRailroad(railRoad: Railroad) {
    this.railroads.add(railRoad);
    const neighbor = railRoad.from === this ? railRoad.to : railRoad.from;
    this.railroadByNeighbor.set(neighbor, railRoad);
  }

  removeRailroad(railRoad: Railroad) {
    this.railroads.delete(railRoad);
    const neighbor = railRoad.from === this ? railRoad.to : railRoad.from;
    this.railroadByNeighbor.delete(neighbor);
  }

  removeNeighboringRails(station: TrainStation) {
    const toRemove = [...this.railroads].find(
      (r) => r.from === station || r.to === station,
    );
    if (toRemove) {
      this.mg.addUpdate({
        type: GameUpdateType.RailroadDestructionEvent,
        id: toRemove.id,
      });
      this.removeRailroad(toRemove);
    }
  }

  neighbors(): TrainStation[] {
    const neighbors: TrainStation[] = [];
    for (const r of this.railroads) {
      if (r.from !== this) {
        neighbors.push(r.from);
      } else {
        neighbors.push(r.to);
      }
    }
    return neighbors;
  }

  tile(): TileRef {
    return this.unit.tile();
  }

  isActive(): boolean {
    return this.unit.isActive();
  }

  getRailroads(): Set<Railroad> {
    return this.railroads;
  }

  getRailroadTo(station: TrainStation): Railroad | null {
    return this.railroadByNeighbor.get(station) ?? null;
  }

  setCluster(cluster: Cluster | null) {
    // Properly disconnect cluster if it's already set
    if (this.cluster !== null) {
      this.cluster.removeStation(this);
    }
    this.cluster = cluster;
  }

  getCluster(): Cluster | null {
    return this.cluster;
  }

  onTrainStop(trainExecution: TrainExecution) {
    const type = this.unit.type();
    const handler = this.stopHandlers[type];
    if (handler) {
      handler.onStop(this.mg, this, trainExecution);
    }
  }
}

/**
 * Cluster of connected stations
 */
export class Cluster {
  public stations: Set<TrainStation> = new Set();
  private tradeStations: Set<TrainStation> = new Set();

  private isTradeStation(station: TrainStation): boolean {
    const type = station.unit.type();
    return type === UnitType.City || type === UnitType.Port;
  }

  has(station: TrainStation) {
    return this.stations.has(station);
  }

  addStation(station: TrainStation) {
    this.stations.add(station);
    if (this.isTradeStation(station)) {
      this.tradeStations.add(station);
    }
    station.setCluster(this);
  }

  removeStation(station: TrainStation) {
    this.stations.delete(station);
    this.tradeStations.delete(station);
  }

  addStations(stations: Set<TrainStation>) {
    for (const station of stations) {
      this.addStation(station);
    }
  }

  merge(other: Cluster) {
    for (const s of other.stations) {
      this.addStation(s);
    }
  }

  hasAnyTradeDestination(player: Player): boolean {
    for (const station of this.tradeStations) {
      if (station.tradeAvailable(player)) {
        return true;
      }
    }
    return false;
  }

  randomTradeDestination(
    player: Player,
    random: PseudoRandom,
  ): TrainStation | null {
    let selected: TrainStation | null = null;
    let eligibleSeen = 0;

    for (const station of this.tradeStations) {
      if (!station.tradeAvailable(player)) continue;
      eligibleSeen++;

      // Reservoir sampling: keep each eligible station with probability 1/eligibleSeen.
      if (random.nextInt(0, eligibleSeen) === 0) {
        selected = station;
      }
    }

    return selected;
  }

  availableForTrade(player: Player): Set<TrainStation> {
    const tradingStations = new Set<TrainStation>();
    for (const station of this.tradeStations) {
      if (station.tradeAvailable(player)) {
        tradingStations.add(station);
      }
    }
    return tradingStations;
  }

  size() {
    return this.stations.size;
  }

  clear() {
    this.stations.clear();
    this.tradeStations.clear();
  }
}

function rel(
  player: Player,
  other: Player,
): "self" | "team" | "ally" | "other" {
  if (player === other) {
    return "self";
  }
  if (player.isOnSameTeam(other)) {
    return "team";
  }
  if (player.isAlliedWith(other)) {
    return "ally";
  }
  return "other";
}

function uniqueExtractorResourcesConnectedToFactory(
  mg: Game,
  factoryStation: TrainStation,
  sourceFactoryLevelSlot: number,
): number {
  const cluster = factoryStation.getCluster();
  if (cluster === null) {
    return 0;
  }

  const owner = factoryStation.unit.owner();
  const ownerFactories = Array.from(cluster.stations)
    .filter(
      (station) =>
        station.unit.type() === UnitType.Factory &&
        station.unit.owner() === owner &&
        station.unit.isActive(),
    )
    .sort((a, b) => a.id - b.id);

  let factoryLevelRank = -1;
  let seenFactoryLevels = 0;
  const normalizedSlot = Math.max(0, sourceFactoryLevelSlot | 0);

  for (const station of ownerFactories) {
    if (station === factoryStation) {
      const maxSlot = Math.max(0, station.unit.level() - 1);
      factoryLevelRank = seenFactoryLevels + Math.min(normalizedSlot, maxSlot);
      break;
    }
    seenFactoryLevels += station.unit.level();
  }

  if (factoryLevelRank < 0) {
    return 0;
  }

  const totalFactoryLevels = ownerFactories.reduce(
    (sum, station) => sum + station.unit.level(),
    0,
  );
  if (factoryLevelRank >= totalFactoryLevels || totalFactoryLevels <= 0) {
    return 0;
  }

  const seedKey = resourceSeedKeyFromGameConfig(mg.config().gameConfig());
  const capacityByType = new Map<ResourceType, number>();
  let barracksLevels = 0;
  let defenseDepartmentLevels = 0;
  let nuclearFacilityLevels = 0;

  for (const station of cluster.stations) {
    if (
      station.unit.type() !== UnitType.Extractor ||
      station.unit.owner() !== owner ||
      !station.unit.isActive()
    ) {
      if (
        station.unit.owner() === owner &&
        station.unit.isActive() &&
        station.unit.type() === UnitType.Barracks
      ) {
        barracksLevels += station.unit.level();
      }
      if (
        station.unit.owner() === owner &&
        station.unit.isActive() &&
        station.unit.type() === UnitType.DefenseDepartment
      ) {
        defenseDepartmentLevels += station.unit.level();
      }
      if (
        station.unit.owner() === owner &&
        station.unit.isActive() &&
        station.unit.type() === UnitType.NuclearFacility
      ) {
        nuclearFacilityLevels += station.unit.level();
      }
      continue;
    }

    const resource = getResourceTypeAtTile(mg, seedKey, station.tile());
    if (resource !== null) {
      const existingCapacity = capacityByType.get(resource) ?? 0;
      capacityByType.set(resource, existingCapacity + station.unit.level());
    }
  }

  const grainCapacity = capacityByType.get(ResourceType.Grain) ?? 0;
  const grainUsedByBarracks = resourceUsedForPoweredLevels(
    barracksLevels,
    grainCapacity,
  );
  capacityByType.set(
    ResourceType.Grain,
    Math.max(0, grainCapacity - grainUsedByBarracks),
  );

  const stoneCapacity = capacityByType.get(ResourceType.Stone) ?? 0;
  const stoneUsedByDefenseDepartment = resourceUsedForPoweredLevels(
    defenseDepartmentLevels,
    stoneCapacity,
  );
  capacityByType.set(
    ResourceType.Stone,
    Math.max(0, stoneCapacity - stoneUsedByDefenseDepartment),
  );

  const oreCapacity = capacityByType.get(ResourceType.Ore) ?? 0;
  const oreUsedByNuclearFacility = resourceUsedForPoweredLevels(
    nuclearFacilityLevels,
    oreCapacity,
  );
  capacityByType.set(
    ResourceType.Ore,
    Math.max(0, oreCapacity - oreUsedByNuclearFacility),
  );

  const resourcesPerFactoryLevel = Array.from(
    { length: totalFactoryLevels },
    () => new Set<ResourceType>(),
  );

  const capacities = Array.from(capacityByType.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  for (const [resource, capacity] of capacities) {
    for (let remaining = capacity; remaining > 0; remaining--) {
      let bestFactoryLevel = -1;
      let bestResourceCount = -1;

      for (
        let factoryLevel = 0;
        factoryLevel < totalFactoryLevels;
        factoryLevel++
      ) {
        const assignedResources = resourcesPerFactoryLevel[factoryLevel];
        if (assignedResources.has(resource)) {
          continue;
        }

        const assignedCount = assignedResources.size;
        if (assignedCount > bestResourceCount) {
          bestResourceCount = assignedCount;
          bestFactoryLevel = factoryLevel;
        }
      }

      if (bestFactoryLevel === -1) {
        break;
      }

      resourcesPerFactoryLevel[bestFactoryLevel].add(resource);
    }
  }

  return resourcesPerFactoryLevel[factoryLevelRank].size;
}

function resourceUsedForPoweredLevels(
  levels: number,
  availableResource: number,
): number {
  let resourceUsed = 0;
  let activeLevels = 0;
  let requiredForNextLevel = 1;

  while (activeLevels < levels && availableResource >= requiredForNextLevel) {
    availableResource -= requiredForNextLevel;
    resourceUsed += requiredForNextLevel;
    activeLevels++;
    requiredForNextLevel *= 2;
  }

  return resourceUsed;
}

function bonusMultiplierForUniqueResources(uniqueResources: number): bigint {
  if (uniqueResources <= 0) {
    return 0n;
  }

  return BigInt((uniqueResources * (uniqueResources + 1)) / 2);
}
