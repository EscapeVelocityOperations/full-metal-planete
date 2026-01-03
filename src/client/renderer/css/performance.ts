/**
 * Performance detection and optimization utilities for CSS renderer
 * Detects mobile devices, low-power mode, and user preferences
 */

export interface PerformanceProfile {
  /** Whether device is mobile/tablet */
  isMobile: boolean;
  /** Whether device is low-power (battery saving, old device, etc) */
  isLowPower: boolean;
  /** Whether user prefers reduced motion */
  prefersReducedMotion: boolean;
  /** Whether touch is the primary input */
  isTouchPrimary: boolean;
  /** Device pixel ratio */
  devicePixelRatio: number;
  /** Estimated performance tier: 'high' | 'medium' | 'low' */
  tier: 'high' | 'medium' | 'low';
}

/**
 * Detect performance characteristics of the current device
 */
export function detectPerformanceProfile(): PerformanceProfile {
  // Mobile detection
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || (navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 1024px)').matches);

  // Touch primary detection
  const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;

  // Reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Device pixel ratio
  const devicePixelRatio = window.devicePixelRatio || 1;

  // Low power detection heuristics
  const isLowPower = detectLowPower(isMobile, devicePixelRatio);

  // Determine performance tier
  const tier = determinePerformanceTier(isMobile, isLowPower, devicePixelRatio, prefersReducedMotion);

  return {
    isMobile,
    isLowPower,
    prefersReducedMotion,
    isTouchPrimary,
    devicePixelRatio,
    tier,
  };
}

/**
 * Heuristic detection of low-power devices
 */
function detectLowPower(isMobile: boolean, dpr: number): boolean {
  // Check for battery API (if available)
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; level: number }> };

  // Heuristics for low-power devices:
  // 1. Mobile with low DPR (typically older devices)
  // 2. Hardcoded low-end device indicators
  // 3. Memory constraints (if available)

  if (isMobile && dpr < 2) {
    return true;
  }

  // Check for hardware concurrency (CPU cores)
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
    return true;
  }

  // Check for device memory (if available)
  const navMem = navigator as Navigator & { deviceMemory?: number };
  if (navMem.deviceMemory && navMem.deviceMemory <= 2) {
    return true;
  }

  return false;
}

/**
 * Determine overall performance tier
 */
function determinePerformanceTier(
  isMobile: boolean,
  isLowPower: boolean,
  dpr: number,
  prefersReducedMotion: boolean
): 'high' | 'medium' | 'low' {
  // Low tier: low-power devices or explicit reduced motion preference
  if (isLowPower || prefersReducedMotion) {
    return 'low';
  }

  // Medium tier: mobile devices with decent specs
  if (isMobile) {
    return 'medium';
  }

  // High tier: desktop with good specs
  return 'high';
}

/**
 * Optimization settings based on performance profile
 */
export interface OptimizationSettings {
  /** Enable CSS transitions */
  enableTransitions: boolean;
  /** Enable complex terrain patterns (marsh/reef) */
  enableTerrainPatterns: boolean;
  /** Enable hover effects */
  enableHoverEffects: boolean;
  /** Enable animations (pulse, etc) */
  enableAnimations: boolean;
  /** Enable drop shadows and complex filters */
  enableComplexFilters: boolean;
  /** Use simplified hex shapes */
  useSimplifiedHexes: boolean;
  /** Debounce delay for zoom (ms) */
  zoomDebounceMs: number;
  /** Throttle delay for touch move (ms) */
  touchThrottleMs: number;
}

/**
 * Get optimization settings based on performance profile
 */
export function getOptimizationSettings(profile: PerformanceProfile): OptimizationSettings {
  switch (profile.tier) {
    case 'low':
      return {
        enableTransitions: false,
        enableTerrainPatterns: false,
        enableHoverEffects: false,
        enableAnimations: false,
        enableComplexFilters: false,
        useSimplifiedHexes: true,
        zoomDebounceMs: 100,
        touchThrottleMs: 32, // ~30fps
      };

    case 'medium':
      return {
        enableTransitions: true,
        enableTerrainPatterns: true,
        enableHoverEffects: false, // Disable on touch devices
        enableAnimations: true,
        enableComplexFilters: false,
        useSimplifiedHexes: false,
        zoomDebounceMs: 50,
        touchThrottleMs: 16, // ~60fps
      };

    case 'high':
    default:
      return {
        enableTransitions: true,
        enableTerrainPatterns: true,
        enableHoverEffects: true,
        enableAnimations: true,
        enableComplexFilters: true,
        useSimplifiedHexes: false,
        zoomDebounceMs: 0,
        touchThrottleMs: 0,
      };
  }
}

/**
 * Create a throttled version of a function
 */
export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number
): (...args: Args) => void {
  if (wait <= 0) return fn;

  let lastTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Args | null = null;

  return function throttled(...args: Args): void {
    const now = Date.now();
    const remaining = wait - (now - lastTime);
    lastArgs = args;

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastTime = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastTime = Date.now();
        timeoutId = null;
        if (lastArgs) {
          fn(...lastArgs);
        }
      }, remaining);
    }
  };
}

/**
 * Request animation frame batching utility
 */
export class RenderBatcher {
  private pending = false;
  private callbacks: Set<() => void> = new Set();

  /**
   * Schedule a render callback for the next animation frame
   */
  schedule(callback: () => void): void {
    this.callbacks.add(callback);

    if (!this.pending) {
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        const cbs = [...this.callbacks];
        this.callbacks.clear();
        for (const cb of cbs) {
          cb();
        }
      });
    }
  }

  /**
   * Cancel all pending callbacks
   */
  clear(): void {
    this.callbacks.clear();
  }
}
