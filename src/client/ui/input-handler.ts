/**
 * Input handler for mouse and keyboard interactions
 */

import type { HexCoord } from '@/shared/game/types';
import type { IHexRenderer } from '@/client/renderer/renderer-factory';

export interface InputEvents {
  hexClick: (coord: HexCoord) => void;
  hexRightClick: (coord: HexCoord) => void;
  hexHover: (coord: HexCoord | null) => void;
  escape: () => void;
  enter: () => void;
  keydown: (event: KeyboardEvent) => void;
}

export class InputHandler {
  private listeners: Map<keyof InputEvents, Set<Function>> = new Map();
  private canvas: HTMLCanvasElement;
  private renderer: IHexRenderer;
  private hoveredHex: HexCoord | null = null;

  constructor(canvas: HTMLCanvasElement, renderer: IHexRenderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.setupEventListeners();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    this.canvas.addEventListener('click', this.handleClick.bind(this));
    this.canvas.addEventListener('contextmenu', this.handleRightClick.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  /**
   * Handle click event
   */
  private handleClick(event: MouseEvent): void {
    const coord = this.getHexAtPosition(event.clientX, event.clientY);
    if (coord) {
      this.emit('hexClick', coord);
    }
  }

  /**
   * Handle right click event
   */
  private handleRightClick(event: MouseEvent): void {
    event.preventDefault();
    const coord = this.getHexAtPosition(event.clientX, event.clientY);
    if (coord) {
      this.emit('hexRightClick', coord);
    }
  }

  /**
   * Handle mouse move event
   */
  private handleMouseMove(event: MouseEvent): void {
    const coord = this.getHexAtPosition(event.clientX, event.clientY);

    if (!this.isSameHex(coord, this.hoveredHex)) {
      this.hoveredHex = coord;
      this.emit('hexHover', coord);
    }
  }

  /**
   * Handle keyboard event
   */
  private handleKeyDown(event: KeyboardEvent): void {
    // Emit generic keydown event for custom key handling
    this.emit('keydown', event);

    switch (event.key) {
      case 'Escape':
        this.emit('escape');
        break;
      case 'Enter':
        this.emit('enter');
        break;
    }
  }

  /**
   * Get hex coordinate at screen position
   */
  private getHexAtPosition(screenX: number, screenY: number): HexCoord | null {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    return this.screenToHex(canvasX, canvasY);
  }

  /**
   * Convert screen coordinates to hex coordinates
   * This is a simplified implementation - should match renderer's hex layout
   */
  private screenToHex(x: number, y: number): HexCoord | null {
    const HEX_SIZE = 20;
    const width = Math.sqrt(3) * HEX_SIZE;
    const height = 2 * HEX_SIZE;

    const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / HEX_SIZE;
    const r = ((2 / 3) * y) / HEX_SIZE;

    return this.roundHex(q, r);
  }

  /**
   * Round fractional hex coordinates to nearest hex
   */
  private roundHex(q: number, r: number): HexCoord {
    const s = -q - r;

    let rq = Math.round(q);
    let rr = Math.round(r);
    let rs = Math.round(s);

    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);

    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs;
    } else if (rDiff > sDiff) {
      rr = -rq - rs;
    }

    return { q: rq, r: rr };
  }

  /**
   * Check if two hex coordinates are the same
   */
  private isSameHex(a: HexCoord | null, b: HexCoord | null): boolean {
    if (a === null || b === null) {
      return a === b;
    }
    return a.q === b.q && a.r === b.r;
  }

  /**
   * Add event listener
   */
  on<K extends keyof InputEvents>(event: K, callback: InputEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof InputEvents>(event: K, callback: InputEvents[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  /**
   * Emit event
   */
  private emit<K extends keyof InputEvents>(event: K, ...args: any[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    this.canvas.removeEventListener('click', this.handleClick.bind(this));
    this.canvas.removeEventListener('contextmenu', this.handleRightClick.bind(this));
    this.canvas.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    this.listeners.clear();
  }
}
