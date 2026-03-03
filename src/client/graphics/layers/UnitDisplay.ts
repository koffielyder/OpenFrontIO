import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { Gold, PlayerActions, UnitType } from "../../../core/game/Game";
import { GameView } from "../../../core/game/GameView";
import {
  ResourceType,
  getResourceTypeAtTile,
  resourceSeedKeyFromGameConfig,
} from "../../../core/game/ResourceNodes";
import {
  GhostStructureChangedEvent,
  ToggleStructureEvent,
} from "../../InputHandler";
import { renderNumber, translateText } from "../../Utils";
import { UIState } from "../UIState";
import { Layer } from "./Layer";
import warshipIcon from "/images/BattleshipIconWhite.svg?url";
import cityIcon from "/images/CityIconWhite.svg?url";
import factoryIcon from "/images/FactoryIconWhite.svg?url";
import goldCoinIcon from "/images/GoldCoinIcon.svg?url";
import mirvIcon from "/images/MIRVIcon.svg?url";
import missileSiloIcon from "/images/MissileSiloIconWhite.svg?url";
import hydrogenBombIcon from "/images/MushroomCloudIconWhite.svg?url";
import atomBombIcon from "/images/NukeIconWhite.svg?url";
import portIcon from "/images/PortIcon.svg?url";
import samLauncherIcon from "/images/SamLauncherIconWhite.svg?url";
import defensePostIcon from "/images/ShieldIconWhite.svg?url";

const BUILDABLE_UNITS: UnitType[] = [
  UnitType.City,
  UnitType.Factory,
  UnitType.Port,
  UnitType.DefensePost,
  UnitType.MissileSilo,
  UnitType.SAMLauncher,
  UnitType.Warship,
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
];

function grainUsedByBarracksLevels(
  barracksLevels: number,
  availableGrain: number,
): number {
  let used = 0;
  let poweredLevels = 0;
  let requiredForNextLevel = 1;

  while (
    poweredLevels < barracksLevels &&
    availableGrain >= requiredForNextLevel
  ) {
    availableGrain -= requiredForNextLevel;
    used += requiredForNextLevel;
    poweredLevels++;
    requiredForNextLevel *= 2;
  }

  return used;
}

function stoneUsedByDefenseDepartmentLevels(
  defenseDepartmentLevels: number,
  availableStone: number,
): number {
  let used = 0;
  let poweredLevels = 0;
  let requiredForNextLevel = 1;

  while (
    poweredLevels < defenseDepartmentLevels &&
    availableStone >= requiredForNextLevel
  ) {
    availableStone -= requiredForNextLevel;
    used += requiredForNextLevel;
    poweredLevels++;
    requiredForNextLevel *= 2;
  }

  return used;
}

function oreUsedByNuclearFacilityLevels(
  nuclearFacilityLevels: number,
  availableOre: number,
): number {
  let used = 0;
  let poweredLevels = 0;
  let requiredForNextLevel = 1;

  while (
    poweredLevels < nuclearFacilityLevels &&
    availableOre >= requiredForNextLevel
  ) {
    availableOre -= requiredForNextLevel;
    used += requiredForNextLevel;
    poweredLevels++;
    requiredForNextLevel *= 2;
  }

  return used;
}

@customElement("unit-display")
export class UnitDisplay extends LitElement implements Layer {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;
  private playerActions: PlayerActions | null = null;
  private keybinds: Record<string, { value: string; key: string }> = {};
  private _cities = 0;
  private _warships = 0;
  private _factories = 0;
  private _missileSilo = 0;
  private _port = 0;
  private _defensePost = 0;
  private _samLauncher = 0;
  private _ore = 0;
  private _grain = 0;
  private _stone = 0;
  private _oreUsed = 0;
  private _grainUsed = 0;
  private _stoneUsed = 0;
  private _resourceTooltipHovered = false;
  private allDisabled = false;
  private _hoveredUnit: UnitType | null = null;

  createRenderRoot() {
    return this;
  }

  init() {
    const config = this.game.config();

    const savedKeybinds = localStorage.getItem("settings.keybinds");
    if (savedKeybinds) {
      try {
        this.keybinds = JSON.parse(savedKeybinds);
      } catch (e) {
        console.warn("Invalid keybinds JSON:", e);
      }
    }

    this.allDisabled = BUILDABLE_UNITS.every((u) => config.isUnitDisabled(u));
    this.requestUpdate();
  }

  private cost(item: UnitType): Gold {
    for (const bu of this.playerActions?.buildableUnits ?? []) {
      if (bu.type === item) {
        return bu.cost;
      }
    }
    return 0n;
  }

  private canBuild(item: UnitType): boolean {
    if (this.game?.config().isUnitDisabled(item)) return false;
    const player = this.game?.myPlayer();
    switch (item) {
      case UnitType.AtomBomb:
      case UnitType.HydrogenBomb:
      case UnitType.MIRV:
        return (
          this.cost(item) <= (player?.gold() ?? 0n) &&
          (player?.units(UnitType.MissileSilo).length ?? 0) > 0
        );
      case UnitType.Warship:
        return (
          this.cost(item) <= (player?.gold() ?? 0n) &&
          (player?.units(UnitType.Port).length ?? 0) > 0
        );
      default:
        return this.cost(item) <= (player?.gold() ?? 0n);
    }
  }

  tick() {
    const player = this.game?.myPlayer();
    player?.actions(undefined, BUILDABLE_UNITS).then((actions) => {
      this.playerActions = actions;
    });
    if (!player) return;
    this._cities = player.totalUnitLevels(UnitType.City);
    this._missileSilo = player.totalUnitLevels(UnitType.MissileSilo);
    this._port = player.totalUnitLevels(UnitType.Port);
    this._defensePost = player.totalUnitLevels(UnitType.DefensePost);
    this._samLauncher = player.totalUnitLevels(UnitType.SAMLauncher);
    this._factories = player.totalUnitLevels(UnitType.Factory);
    this._warships = player.totalUnitLevels(UnitType.Warship);
    const seedKey = resourceSeedKeyFromGameConfig(
      this.game.config().gameConfig(),
    );
    const myPlayerId = player.id();
    const stations = this.game
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

    const stationById = new Map<number, (typeof stations)[number]>();
    for (const station of stations) {
      stationById.set(station.id(), station);
    }

    const maxRange = this.game.config().trainStationMaxRange();
    const minRangeSquared = this.game.config().trainStationMinRange() ** 2;
    const neighborsById = new Map<number, number[]>();

    for (const station of stations) {
      const neighbors = this.game
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

    const components: number[][] = [];
    const visited = new Set<number>();
    for (const station of stations) {
      const startId = station.id();
      if (visited.has(startId)) {
        continue;
      }
      const stack = [startId];
      visited.add(startId);
      const component: number[] = [];

      while (stack.length > 0) {
        const currentId = stack.pop()!;
        component.push(currentId);
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

    let ore = 0;
    let grain = 0;
    let stone = 0;
    let oreUsed = 0;
    let grainUsed = 0;
    let stoneUsed = 0;

    for (const componentIds of components) {
      const componentStations = componentIds
        .map((id) => stationById.get(id))
        .filter(
          (unit): unit is (typeof stations)[number] => unit !== undefined,
        );

      const myFactories = componentStations.filter(
        (station) =>
          station.type() === UnitType.Factory &&
          station.owner().id() === myPlayerId,
      );
      const factoryLevels = myFactories.reduce(
        (sum, station) => sum + station.level(),
        0,
      );
      const myBarracks = componentStations.filter(
        (station) =>
          station.type() === UnitType.Barracks &&
          station.owner().id() === myPlayerId,
      );
      const barracksLevels = myBarracks.reduce(
        (sum, station) => sum + station.level(),
        0,
      );
      const myDefenseDepartments = componentStations.filter(
        (station) =>
          station.type() === UnitType.DefenseDepartment &&
          station.owner().id() === myPlayerId,
      );
      const defenseDepartmentLevels = myDefenseDepartments.reduce(
        (sum, station) => sum + station.level(),
        0,
      );
      const myNuclearFacilities = componentStations.filter(
        (station) =>
          station.type() === UnitType.NuclearFacility &&
          station.owner().id() === myPlayerId,
      );
      const nuclearFacilityLevels = myNuclearFacilities.reduce(
        (sum, station) => sum + station.level(),
        0,
      );
      const myWarDepartments = componentStations.filter(
        (station) =>
          station.type() === UnitType.WarDepartment &&
          station.owner().id() === myPlayerId,
      );
      const warDepartmentLevels = myWarDepartments.reduce(
        (sum, station) => sum + station.level(),
        0,
      );

      let oreCapacity = 0;
      let grainCapacity = 0;
      let stoneCapacity = 0;

      for (const station of componentStations) {
        if (
          station.type() !== UnitType.Extractor ||
          station.owner().id() !== myPlayerId
        ) {
          continue;
        }

        const type = getResourceTypeAtTile(this.game, seedKey, station.tile());
        if (type === null) {
          continue;
        }

        switch (type) {
          case ResourceType.Ore:
            oreCapacity += station.level();
            break;
          case ResourceType.Grain:
            grainCapacity += station.level();
            break;
          case ResourceType.Stone:
            stoneCapacity += station.level();
            break;
        }
      }

      ore += oreCapacity;
      grain += grainCapacity;
      stone += stoneCapacity;

      const oreUsedByNuclearFacility = oreUsedByNuclearFacilityLevels(
        nuclearFacilityLevels,
        oreCapacity,
      );
      const oreLeftForWarDepartment = Math.max(
        0,
        oreCapacity - oreUsedByNuclearFacility,
      );
      const oreUsedByWarDepartment = oreUsedByNuclearFacilityLevels(
        warDepartmentLevels,
        oreLeftForWarDepartment,
      );
      const oreLeftForFactories = Math.max(
        0,
        oreCapacity - oreUsedByNuclearFacility - oreUsedByWarDepartment,
      );
      const oreUsedByFactories = Math.min(oreLeftForFactories, factoryLevels);
      oreUsed +=
        oreUsedByFactories + oreUsedByNuclearFacility + oreUsedByWarDepartment;
      const grainUsedByBarracks = grainUsedByBarracksLevels(
        barracksLevels,
        grainCapacity,
      );
      const grainLeftForFactories = Math.max(
        0,
        grainCapacity - grainUsedByBarracks,
      );
      const grainUsedByFactories = Math.min(
        grainLeftForFactories,
        factoryLevels,
      );
      grainUsed += grainUsedByFactories + grainUsedByBarracks;
      const stoneUsedByDefenseDepartment = stoneUsedByDefenseDepartmentLevels(
        defenseDepartmentLevels,
        stoneCapacity,
      );
      const stoneLeftForFactories = Math.max(
        0,
        stoneCapacity - stoneUsedByDefenseDepartment,
      );
      const stoneUsedByFactories = Math.min(
        stoneLeftForFactories,
        factoryLevels,
      );
      stoneUsed += stoneUsedByFactories + stoneUsedByDefenseDepartment;
    }

    this._ore = ore;
    this._grain = grain;
    this._stone = stone;
    this._oreUsed = oreUsed;
    this._grainUsed = grainUsed;
    this._stoneUsed = stoneUsed;

    this.requestUpdate();
  }

  private renderResourceBreakdownRow(
    color: string,
    label: string,
    used: number,
    total: number,
  ) {
    const free = Math.max(0, total - used);
    return html`
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-1">
          <span
            class="inline-block w-2.5 h-2.5 rounded-full border border-black/70"
            style=${`background:${color}`}
          ></span>
          <span class="text-gray-100">${label}</span>
        </div>
        <span class="text-gray-300">used ${used} • free ${free}</span>
      </div>
    `;
  }

  private renderResourceSummary() {
    return html`
      <div
        class="relative bg-gray-800/70 backdrop-blur-xs rounded-lg px-2 py-1 text-white text-xs"
        @mouseenter=${() => {
          this._resourceTooltipHovered = true;
          this.requestUpdate();
        }}
        @mouseleave=${() => {
          this._resourceTooltipHovered = false;
          this.requestUpdate();
        }}
      >
        ${this._resourceTooltipHovered
          ? html`
              <div
                class="absolute -top-26 left-1/2 -translate-x-1/2 bg-gray-900/95 border border-gray-700 rounded-sm px-2 py-1.5 min-w-52 z-20 shadow-lg"
              >
                <div class="text-gray-200 font-bold mb-1">Resources</div>
                <div class="flex flex-col gap-1">
                  ${this.renderResourceBreakdownRow(
                    "#7c3aed",
                    "Ore",
                    this._oreUsed,
                    this._ore,
                  )}
                  ${this.renderResourceBreakdownRow(
                    "#ca8a04",
                    "Grain",
                    this._grainUsed,
                    this._grain,
                  )}
                  ${this.renderResourceBreakdownRow(
                    "#6b7280",
                    "Stone",
                    this._stoneUsed,
                    this._stone,
                  )}
                </div>
              </div>
            `
          : null}
        <div class="flex items-center gap-3">
          ${this.renderResourcePill("#7c3aed", this._ore)}
          ${this.renderResourcePill("#ca8a04", this._grain)}
          ${this.renderResourcePill("#6b7280", this._stone)}
        </div>
      </div>
    `;
  }

  render() {
    const myPlayer = this.game?.myPlayer();
    if (
      !this.game ||
      !myPlayer ||
      this.game.inSpawnPhase() ||
      !myPlayer.isAlive()
    ) {
      return null;
    }
    if (this.allDisabled) {
      return null;
    }

    return html`
      <div
        class="hidden min-[1200px]:flex fixed bottom-4 left-1/2 transform -translate-x-1/2 z-1100 2xl:flex-row xl:flex-col min-[1200px]:flex-col 2xl:gap-5 xl:gap-2 min-[1200px]:gap-2 justify-center items-center"
      >
        ${this.renderResourceSummary()}
        <div class="bg-gray-800/70 backdrop-blur-xs rounded-lg p-0.5">
          <div class="grid grid-rows-1 auto-cols-max grid-flow-col gap-1 w-fit">
            ${this.renderUnitItem(
              cityIcon,
              this._cities,
              UnitType.City,
              "city",
              this.keybinds["buildCity"]?.key ?? "1",
            )}
            ${this.renderUnitItem(
              factoryIcon,
              this._factories,
              UnitType.Factory,
              "factory",
              this.keybinds["buildFactory"]?.key ?? "2",
            )}
            ${this.renderUnitItem(
              portIcon,
              this._port,
              UnitType.Port,
              "port",
              this.keybinds["buildPort"]?.key ?? "3",
            )}
            ${this.renderUnitItem(
              defensePostIcon,
              this._defensePost,
              UnitType.DefensePost,
              "defense_post",
              this.keybinds["buildDefensePost"]?.key ?? "4",
            )}
            ${this.renderUnitItem(
              missileSiloIcon,
              this._missileSilo,
              UnitType.MissileSilo,
              "missile_silo",
              this.keybinds["buildMissileSilo"]?.key ?? "5",
            )}
            ${this.renderUnitItem(
              samLauncherIcon,
              this._samLauncher,
              UnitType.SAMLauncher,
              "sam_launcher",
              this.keybinds["buildSamLauncher"]?.key ?? "6",
            )}
          </div>
        </div>
        <div class="bg-gray-800/70 backdrop-blur-xs rounded-lg p-0.5 w-fit">
          <div class="grid grid-rows-1 auto-cols-max grid-flow-col gap-1">
            ${this.renderUnitItem(
              warshipIcon,
              this._warships,
              UnitType.Warship,
              "warship",
              this.keybinds["buildWarship"]?.key ?? "7",
            )}
            ${this.renderUnitItem(
              atomBombIcon,
              null,
              UnitType.AtomBomb,
              "atom_bomb",
              this.keybinds["buildAtomBomb"]?.key ?? "8",
            )}
            ${this.renderUnitItem(
              hydrogenBombIcon,
              null,
              UnitType.HydrogenBomb,
              "hydrogen_bomb",
              this.keybinds["buildHydrogenBomb"]?.key ?? "9",
            )}
            ${this.renderUnitItem(
              mirvIcon,
              null,
              UnitType.MIRV,
              "mirv",
              this.keybinds["buildMIRV"]?.key ?? "0",
            )}
          </div>
        </div>
      </div>
    `;
  }

  private renderResourcePill(color: string, amount: number) {
    return html`
      <div class="flex items-center gap-1">
        <span
          class="inline-block w-2.5 h-2.5 rounded-full border border-black/70"
          style=${`background:${color}`}
        ></span>
        <span class="text-gray-100">${renderNumber(BigInt(amount))}</span>
      </div>
    `;
  }

  private renderUnitItem(
    icon: string,
    number: number | null,
    unitType: UnitType,
    structureKey: string,
    hotkey: string,
  ) {
    if (this.game.config().isUnitDisabled(unitType)) {
      return html``;
    }
    const selected = this.uiState.ghostStructure === unitType;
    const hovered = this._hoveredUnit === unitType;
    const displayHotkey = hotkey
      .replace("Digit", "")
      .replace("Key", "")
      .toUpperCase();

    return html`
      <div
        class="flex flex-col items-center relative"
        @mouseenter=${() => {
          this._hoveredUnit = unitType;
          this.requestUpdate();
        }}
        @mouseleave=${() => {
          this._hoveredUnit = null;
          this.requestUpdate();
        }}
      >
        ${hovered
          ? html`
              <div
                class="absolute -top-[250%] left-1/2 -translate-x-1/2 text-gray-200 text-center w-max text-xs bg-gray-800/90 backdrop-blur-xs rounded-sm p-1 z-20 shadow-lg pointer-events-none"
              >
                <div class="font-bold text-sm mb-1">
                  ${translateText(
                    "unit_type." + structureKey,
                  )}${` [${displayHotkey}]`}
                </div>
                <div class="p-2">
                  ${translateText("build_menu.desc." + structureKey)}
                </div>
                <div class="flex items-center justify-center gap-1">
                  <img src=${goldCoinIcon} width="13" height="13" />
                  <span class="text-yellow-300"
                    >${renderNumber(this.cost(unitType))}</span
                  >
                </div>
              </div>
            `
          : null}
        <div
          class="${this.canBuild(unitType)
            ? ""
            : "opacity-40"} border border-slate-500 rounded-sm pr-2 pb-1 flex items-center gap-2 cursor-pointer
             ${selected ? "hover:bg-gray-400/10" : "hover:bg-gray-800"}
             rounded-sm text-white ${selected ? "bg-slate-400/20" : ""}"
          @click=${() => {
            if (selected) {
              this.uiState.ghostStructure = null;
              this.eventBus?.emit(new GhostStructureChangedEvent(null));
            } else if (this.canBuild(unitType)) {
              this.uiState.ghostStructure = unitType;
              this.eventBus?.emit(new GhostStructureChangedEvent(unitType));
            }
            this.requestUpdate();
          }}
          @mouseenter=${() => {
            switch (unitType) {
              case UnitType.AtomBomb:
              case UnitType.HydrogenBomb:
                this.eventBus?.emit(
                  new ToggleStructureEvent([
                    UnitType.MissileSilo,
                    UnitType.SAMLauncher,
                  ]),
                );
                break;
              case UnitType.Warship:
                this.eventBus?.emit(new ToggleStructureEvent([UnitType.Port]));
                break;
              default:
                this.eventBus?.emit(new ToggleStructureEvent([unitType]));
            }
          }}
          @mouseleave=${() =>
            this.eventBus?.emit(new ToggleStructureEvent(null))}
        >
          ${html`<div class="ml-1 text-xs relative -top-1.5 text-gray-400">
            ${displayHotkey}
          </div>`}
          <div class="flex items-center gap-1 pt-1">
            <img src=${icon} alt=${structureKey} class="align-middle size-6" />
            ${number !== null ? renderNumber(number) : null}
          </div>
        </div>
      </div>
    `;
  }
}
