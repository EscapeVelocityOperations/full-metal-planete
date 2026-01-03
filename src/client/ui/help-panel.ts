/**
 * Help Panel - Tutorial and rules reference for new players
 *
 * Features:
 * - Quick reference card for unit abilities
 * - Keyboard shortcuts reference
 * - Basic tutorial tips
 * - Link to full rules
 */

export type HelpTab = 'units' | 'actions' | 'shortcuts' | 'tutorial';

export class HelpPanel {
  private panel: HTMLElement | null = null;
  private isVisible: boolean = false;
  private currentTab: HelpTab = 'units';
  private helpBtn: HTMLButtonElement | null = null;

  /**
   * Initialize the help panel
   */
  initialize(): void {
    this.createHelpButton();
    this.createPanel();
    this.setupKeyboardShortcut();
  }

  /**
   * Create the help button in the HUD
   */
  private createHelpButton(): void {
    this.helpBtn = document.createElement('button');
    this.helpBtn.id = 'help-btn';
    this.helpBtn.className = 'help-btn';
    this.helpBtn.innerHTML = '?';
    this.helpBtn.title = 'Help & Rules (H)';
    this.helpBtn.addEventListener('click', () => this.toggle());

    // Add to zoom controls area (bottom right)
    const zoomControls = document.getElementById('zoom-controls');
    if (zoomControls) {
      zoomControls.insertBefore(this.helpBtn, zoomControls.firstChild);
    } else {
      // Fallback: add to body
      document.body.appendChild(this.helpBtn);
    }
  }

  /**
   * Create the help panel DOM
   */
  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.id = 'help-panel';
    this.panel.className = 'help-panel hidden';
    this.panel.innerHTML = this.getPanelHTML();
    document.body.appendChild(this.panel);

    // Setup tab switching
    this.setupTabs();

    // Close button
    const closeBtn = this.panel.querySelector('#help-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    // Close on background click
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) {
        this.hide();
      }
    });
  }

  /**
   * Setup keyboard shortcut (H key)
   */
  private setupKeyboardShortcut(): void {
    document.addEventListener('keydown', (e) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.toggle();
      }

      // Escape to close
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * Setup tab switching
   */
  private setupTabs(): void {
    if (!this.panel) return;

    const tabs = this.panel.querySelectorAll('.help-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = (tab as HTMLElement).dataset.tab as HelpTab;
        this.switchTab(tabId);
      });
    });
  }

  /**
   * Switch to a different tab
   */
  private switchTab(tabId: HelpTab): void {
    if (!this.panel) return;

    this.currentTab = tabId;

    // Update tab buttons
    const tabs = this.panel.querySelectorAll('.help-tab');
    tabs.forEach(tab => {
      tab.classList.toggle('active', (tab as HTMLElement).dataset.tab === tabId);
    });

    // Update content
    const contents = this.panel.querySelectorAll('.help-content');
    contents.forEach(content => {
      content.classList.toggle('active', (content as HTMLElement).dataset.content === tabId);
    });
  }

  /**
   * Get the panel HTML
   */
  private getPanelHTML(): string {
    return `
      <div class="help-modal">
        <div class="help-header">
          <h2>Full Metal Planete - Help</h2>
          <button id="help-close-btn" class="help-close-btn">&times;</button>
        </div>

        <div class="help-tabs">
          <button class="help-tab active" data-tab="units">Units</button>
          <button class="help-tab" data-tab="actions">Actions</button>
          <button class="help-tab" data-tab="shortcuts">Controls</button>
          <button class="help-tab" data-tab="tutorial">Tutorial</button>
        </div>

        <div class="help-body">
          ${this.getUnitsContent()}
          ${this.getActionsContent()}
          ${this.getShortcutsContent()}
          ${this.getTutorialContent()}
        </div>

        <div class="help-footer">
          <a href="http://jeuxstrategie.free.fr/Full_metal_planete_complet.php" target="_blank" rel="noopener noreferrer" class="rules-link">
            Full Rules (External)
          </a>
          <span class="help-hint">Press <kbd>H</kbd> to toggle this panel</span>
        </div>
      </div>
    `;
  }

  /**
   * Get units reference content
   */
  private getUnitsContent(): string {
    return `
      <div class="help-content active" data-content="units">
        <h3>Combat Units</h3>
        <table class="help-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Domain</th>
              <th>Range</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="unit-icon">T</span> Tank</td>
              <td>Land</td>
              <td>2 hex</td>
              <td>3 hex on mountains</td>
            </tr>
            <tr>
              <td><span class="unit-icon">S</span> Super Tank</td>
              <td>Land</td>
              <td>3 hex</td>
              <td>Cannot enter mountains</td>
            </tr>
            <tr>
              <td><span class="unit-icon">M</span> Motor Boat</td>
              <td>Sea</td>
              <td>2 hex</td>
              <td>-</td>
            </tr>
            <tr>
              <td><span class="unit-icon">W</span> Tower</td>
              <td>Fixed</td>
              <td>2 hex</td>
              <td>On Astronef podes</td>
            </tr>
          </tbody>
        </table>

        <h3>Transport Units</h3>
        <table class="help-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Domain</th>
              <th>Capacity</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="unit-icon">B</span> Barge</td>
              <td>Sea</td>
              <td>4 slots</td>
              <td>Can carry Crab, Converter</td>
            </tr>
            <tr>
              <td><span class="unit-icon">C</span> Crab</td>
              <td>Land</td>
              <td>2 slots</td>
              <td>Can enter mountains</td>
            </tr>
            <tr>
              <td><span class="unit-icon">V</span> Converter</td>
              <td>Land</td>
              <td>1 slot</td>
              <td>Builds units, predicts tide</td>
            </tr>
          </tbody>
        </table>

        <h3>Cargo Sizes</h3>
        <div class="cargo-info">
          <span class="cargo-badge small">1 slot</span> Mineral, Tank, Super Tank, Bridge<br>
          <span class="cargo-badge large">2 slots</span> Converter, Crab
        </div>
      </div>
    `;
  }

  /**
   * Get actions reference content
   */
  private getActionsContent(): string {
    return `
      <div class="help-content" data-content="actions">
        <h3>Action Point Costs</h3>
        <table class="help-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Move</td><td>1 AP per hex</td></tr>
            <tr><td>Load/Unload item</td><td>1 AP per item</td></tr>
            <tr><td>Build (Converter)</td><td>1 AP to unload</td></tr>
            <tr><td>Enter/Exit Astronef</td><td>1 AP per unit</td></tr>
            <tr><td>Destroy enemy unit</td><td>2 AP (2 shots)</td></tr>
            <tr><td>Capture enemy unit</td><td>1 AP</td></tr>
            <tr><td>Rebuild Tower</td><td>2 AP</td></tr>
            <tr><td>Take Off</td><td>1-4 AP</td></tr>
          </tbody>
        </table>

        <h3>AP Allocation</h3>
        <div class="ap-info">
          <div class="ap-row"><span>Turn 3:</span> <strong>5 AP</strong></div>
          <div class="ap-row"><span>Turn 4:</span> <strong>10 AP</strong></div>
          <div class="ap-row"><span>Turns 5+:</span> <strong>15 AP</strong></div>
          <div class="ap-row"><span>Max saved:</span> <strong>10 AP</strong></div>
        </div>

        <h3>Tide Effects</h3>
        <table class="help-table tide-table">
          <thead>
            <tr>
              <th>Tide</th>
              <th>Marsh</th>
              <th>Reef</th>
            </tr>
          </thead>
          <tbody>
            <tr class="tide-low">
              <td><span class="tide-badge low">LOW</span></td>
              <td>Land</td>
              <td>Land</td>
            </tr>
            <tr class="tide-normal">
              <td><span class="tide-badge normal">NORMAL</span></td>
              <td>Land</td>
              <td>Sea</td>
            </tr>
            <tr class="tide-high">
              <td><span class="tide-badge high">HIGH</span></td>
              <td>Sea</td>
              <td>Sea</td>
            </tr>
          </tbody>
        </table>

        <h3>Combat Rules</h3>
        <ul class="help-list">
          <li><strong>Destroy:</strong> 2 shots from same player = destruction</li>
          <li><strong>Capture:</strong> 2 units adjacent + 1 AP</li>
          <li>Each combat unit can fire <strong>max 2 times/turn</strong></li>
          <li>Units "under fire" (2+ enemy units in range) cannot move</li>
        </ul>
      </div>
    `;
  }

  /**
   * Get keyboard shortcuts content
   */
  private getShortcutsContent(): string {
    return `
      <div class="help-content" data-content="shortcuts">
        <h3>Mouse Controls</h3>
        <table class="help-table">
          <tbody>
            <tr><td><kbd>Left Click</kbd></td><td>Select unit / Move to hex</td></tr>
            <tr><td><kbd>Right Click</kbd></td><td>Deselect / Context menu</td></tr>
            <tr><td><kbd>Scroll</kbd></td><td>Zoom in/out</td></tr>
            <tr><td><kbd>Drag</kbd></td><td>Pan camera</td></tr>
          </tbody>
        </table>

        <h3>Keyboard Shortcuts</h3>
        <table class="help-table">
          <tbody>
            <tr><td><kbd>R</kbd></td><td>Rotate unit before placement</td></tr>
            <tr><td><kbd>Escape</kbd></td><td>Cancel selection / Close dialog</td></tr>
            <tr><td><kbd>Enter</kbd></td><td>Confirm action</td></tr>
            <tr><td><kbd>H</kbd></td><td>Toggle this help panel</td></tr>
            <tr><td><kbd>+</kbd> / <kbd>-</kbd></td><td>Zoom in/out</td></tr>
            <tr><td><kbd>0</kbd></td><td>Reset zoom to fit</td></tr>
          </tbody>
        </table>

        <h3>Game Controls</h3>
        <table class="help-table">
          <tbody>
            <tr><td>End Turn</td><td>Click "End Turn" button or wait for timer</td></tr>
            <tr><td>Save AP</td><td>Choose amount when ending turn</td></tr>
            <tr><td>Undo</td><td>Click undo in action history (current turn only)</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Get tutorial content for new players
   */
  private getTutorialContent(): string {
    return `
      <div class="help-content" data-content="tutorial">
        <h3>Getting Started</h3>
        <div class="tutorial-section">
          <h4>1. Landing Phase (Turn 1)</h4>
          <p>Position your Astronef on the map. It occupies 4 hexes and must be placed on land or marsh terrain. Press <kbd>R</kbd> to rotate before clicking to place.</p>
        </div>

        <div class="tutorial-section">
          <h4>2. Deployment Phase (Turn 2)</h4>
          <p>Deploy your units from the Astronef. Click a unit in your inventory, then click an adjacent hex to deploy it. Sea units deploy to adjacent sea hexes.</p>
        </div>

        <div class="tutorial-section">
          <h4>3. Playing Phase (Turns 3-25)</h4>
          <p>Each turn you have 3 minutes and Action Points (AP) to spend. Move units, collect minerals, and fight enemies!</p>
        </div>

        <h3>Key Concepts</h3>
        <div class="tutorial-tips">
          <div class="tip">
            <strong>Minerals</strong>
            <p>Collect minerals with transporters (Crab, Barge) and bring them to your Astronef. Each mineral = 2 points!</p>
          </div>
          <div class="tip">
            <strong>Tides</strong>
            <p>Tides change terrain! At high tide, marsh becomes sea. Watch the forecast if you have a Converter.</p>
          </div>
          <div class="tip">
            <strong>Combat</strong>
            <p>Two units firing at the same target destroys it. Two units adjacent to an enemy can capture it instead!</p>
          </div>
          <div class="tip">
            <strong>Lift-Off</strong>
            <p>At Turn 21, decide whether to leave safely or stay until Turn 25 for more minerals. Stranded = 0 points!</p>
          </div>
        </div>

        <h3>Victory</h3>
        <div class="victory-info">
          <p>Score = <strong>2 pts/mineral</strong> + <strong>1 pt/equipment</strong> + <strong>1 pt/intact turret</strong></p>
          <p class="warning">Only cargo inside your Astronef when you lift off counts!</p>
        </div>
      </div>
    `;
  }

  /**
   * Show the help panel
   */
  show(): void {
    if (this.panel) {
      this.panel.classList.remove('hidden');
      this.isVisible = true;
    }
  }

  /**
   * Hide the help panel
   */
  hide(): void {
    if (this.panel) {
      this.panel.classList.add('hidden');
      this.isVisible = false;
    }
  }

  /**
   * Toggle the help panel visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if the panel is visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    if (this.helpBtn) {
      this.helpBtn.remove();
      this.helpBtn = null;
    }
  }
}
