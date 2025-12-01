/**
 * Deployment Inventory UI component for Full Metal Planète
 * Shows available units for deployment during deployment phase
 */

import { UnitType, type Unit, type PlayerColor } from '@/shared/game/types';

export interface DeploymentInventoryConfig {
  playerColor: string;
  onUnitSelect: (unitType: UnitType, unitId: string) => void;
  onRotate: () => void;
}

// Unit type display info
const UNIT_INFO: Record<UnitType, { name: string; symbol: string; description: string }> = {
  [UnitType.Astronef]: { name: 'Astronef', symbol: '\u25C6', description: 'Main spacecraft (4 hexes, rotatable)' },
  [UnitType.Tower]: { name: 'Tower', symbol: '\u25B2', description: 'Defensive tower' },
  [UnitType.Tank]: { name: 'Tank', symbol: '\u25A0', description: 'Main combat unit (1 AP/hex)' },
  [UnitType.SuperTank]: { name: 'Super Tank', symbol: '\u25A0\u25A0', description: 'Heavy combat unit (2 AP/hex)' },
  [UnitType.MotorBoat]: { name: 'Motor Boat', symbol: '\u25BA', description: 'Fast water unit (1 AP/hex on water)' },
  [UnitType.Barge]: { name: 'Barge', symbol: '\u25AC', description: 'Transport unit (2 hexes, can carry units)' },
  [UnitType.Crab]: { name: 'Crab', symbol: '\u2739', description: 'Amphibious unit (works on all terrain)' },
  [UnitType.Converter]: { name: 'Converter', symbol: '\u25CE', description: 'Mineral converter (extracts minerals)' },
  [UnitType.Bridge]: { name: 'Bridge', symbol: '\u2550', description: 'Creates land crossing over water' },
};

// Player color to CSS color mapping
const PLAYER_COLORS: Record<string, string> = {
  red: '#ff4444',
  blue: '#4444ff',
  green: '#44ff44',
  yellow: '#ffff44',
};

export class DeploymentInventory {
  private container: HTMLDivElement;
  private config: DeploymentInventoryConfig;
  private units: Unit[] = [];
  private deployedUnitIds: Set<string> = new Set();
  private selectedUnitId: string | null = null;
  private isVisible: boolean = false;

  constructor(config: DeploymentInventoryConfig) {
    this.config = config;
    this.container = this.createContainer();
    this.injectStyles();
    document.body.appendChild(this.container);
  }

  /**
   * Create the main container element
   */
  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'deployment-inventory';
    container.className = 'deployment-inventory hidden';
    return container;
  }

  /**
   * Inject CSS styles
   */
  private injectStyles(): void {
    const styleId = 'deployment-inventory-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .deployment-inventory {
        position: fixed;
        left: 20px;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(20, 20, 30, 0.95);
        border: 2px solid #4a90e2;
        border-radius: 12px;
        padding: 15px;
        min-width: 200px;
        max-height: 80vh;
        overflow-y: auto;
        z-index: 100;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }

      .deployment-inventory.hidden {
        display: none;
      }

      .inventory-header {
        font-size: 14px;
        font-weight: bold;
        color: #4a90e2;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(74, 144, 226, 0.3);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .rotate-hint {
        font-size: 11px;
        color: #888;
        font-weight: normal;
        text-transform: none;
        letter-spacing: 0;
      }

      .rotate-hint kbd {
        background: rgba(74, 144, 226, 0.3);
        padding: 2px 6px;
        border-radius: 3px;
        margin-left: 4px;
      }

      .inventory-unit {
        display: flex;
        align-items: center;
        padding: 10px;
        margin-bottom: 8px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        border: 2px solid transparent;
      }

      .inventory-unit:hover {
        background: rgba(74, 144, 226, 0.2);
      }

      .inventory-unit.selected {
        border-color: #4a90e2;
        background: rgba(74, 144, 226, 0.3);
      }

      .inventory-unit.deployed {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .inventory-unit.deployed:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      .unit-symbol {
        font-size: 24px;
        width: 40px;
        text-align: center;
        text-shadow:
          1px 1px 2px rgba(0,0,0,0.8),
          -1px -1px 2px rgba(0,0,0,0.8);
      }

      .unit-info {
        flex: 1;
        margin-left: 10px;
      }

      .unit-name {
        font-size: 14px;
        font-weight: bold;
        color: #fff;
      }

      .unit-description {
        font-size: 11px;
        color: #888;
        margin-top: 2px;
      }

      .unit-status {
        font-size: 10px;
        color: #44ff44;
        text-transform: uppercase;
        margin-left: 10px;
      }

      .unit-status.deployed {
        color: #888;
      }

      .inventory-count {
        font-size: 12px;
        color: #888;
        margin-top: 15px;
        padding-top: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Set the units available for deployment
   * Note: Tower is excluded as it deploys automatically with the Astronef
   */
  setUnits(units: Unit[]): void {
    // Filter to only include units owned by this player that can be deployed
    // Tower is excluded since it's auto-deployed with Astronef
    this.units = units.filter(u =>
      u.owner.includes(this.config.playerColor) &&
      u.type !== UnitType.Tower
    );
    this.render();
  }

  /**
   * Mark units as deployed
   */
  setDeployedUnits(deployedIds: string[]): void {
    this.deployedUnitIds = new Set(deployedIds);
    this.render();
  }

  /**
   * Get the selected unit type
   */
  getSelectedUnitId(): string | null {
    return this.selectedUnitId;
  }

  /**
   * Get the selected unit
   */
  getSelectedUnit(): Unit | null {
    if (!this.selectedUnitId) return null;
    return this.units.find(u => u.id === this.selectedUnitId) || null;
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedUnitId = null;
    this.render();
  }

  /**
   * Show the inventory
   */
  show(): void {
    this.isVisible = true;
    this.container.classList.remove('hidden');
  }

  /**
   * Hide the inventory
   */
  hide(): void {
    this.isVisible = false;
    this.container.classList.add('hidden');
  }

  /**
   * Render the inventory
   */
  private render(): void {
    const playerColor = PLAYER_COLORS[this.config.playerColor] || '#ffffff';
    const availableCount = this.units.filter(u => !this.deployedUnitIds.has(u.id)).length;
    const totalCount = this.units.length;

    this.container.innerHTML = `
      <div class="inventory-header">
        <span>Deploy Units</span>
        <span class="rotate-hint">Press<kbd>R</kbd>to rotate</span>
      </div>
      ${this.units.map(unit => this.renderUnit(unit, playerColor)).join('')}
      <div class="inventory-count">
        ${availableCount} of ${totalCount} units remaining
      </div>
    `;

    // Add click handlers
    this.container.querySelectorAll('.inventory-unit:not(.deployed)').forEach((el, index) => {
      el.addEventListener('click', () => {
        const unitId = (el as HTMLElement).dataset.unitId;
        if (unitId) {
          this.selectedUnitId = unitId;
          this.render();
          const unit = this.units.find(u => u.id === unitId);
          if (unit) {
            this.config.onUnitSelect(unit.type, unitId);
          }
        }
      });
    });
  }

  /**
   * Render a single unit item
   */
  private renderUnit(unit: Unit, playerColor: string): string {
    const info = UNIT_INFO[unit.type];
    const isDeployed = this.deployedUnitIds.has(unit.id);
    const isSelected = this.selectedUnitId === unit.id;

    const classes = [
      'inventory-unit',
      isDeployed ? 'deployed' : '',
      isSelected ? 'selected' : '',
    ].filter(Boolean).join(' ');

    return `
      <div class="${classes}" data-unit-id="${unit.id}" data-unit-type="${unit.type}">
        <div class="unit-symbol" style="color: ${playerColor}">${info.symbol}</div>
        <div class="unit-info">
          <div class="unit-name">${info.name}</div>
          <div class="unit-description">${info.description}</div>
        </div>
        <div class="unit-status ${isDeployed ? 'deployed' : ''}">${isDeployed ? 'Placed' : 'Ready'}</div>
      </div>
    `;
  }

  /**
   * Destroy the component
   */
  destroy(): void {
    this.container.remove();
  }
}
