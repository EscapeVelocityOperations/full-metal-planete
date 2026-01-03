/**
 * Tests for CSS renderer performance detection and optimization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getOptimizationSettings,
  throttle,
  RenderBatcher,
  type PerformanceProfile,
} from '../css/performance';

describe('Optimization Settings', () => {
  it('returns high-tier settings for desktop', () => {
    const profile: PerformanceProfile = {
      isMobile: false,
      isLowPower: false,
      prefersReducedMotion: false,
      isTouchPrimary: false,
      devicePixelRatio: 2,
      tier: 'high',
    };

    const settings = getOptimizationSettings(profile);
    expect(settings.enableTransitions).toBe(true);
    expect(settings.enableTerrainPatterns).toBe(true);
    expect(settings.enableHoverEffects).toBe(true);
    expect(settings.enableAnimations).toBe(true);
    expect(settings.enableComplexFilters).toBe(true);
    expect(settings.useSimplifiedHexes).toBe(false);
    expect(settings.zoomDebounceMs).toBe(0);
  });

  it('returns medium-tier settings for mobile', () => {
    const profile: PerformanceProfile = {
      isMobile: true,
      isLowPower: false,
      prefersReducedMotion: false,
      isTouchPrimary: true,
      devicePixelRatio: 3,
      tier: 'medium',
    };

    const settings = getOptimizationSettings(profile);
    expect(settings.enableTransitions).toBe(true);
    expect(settings.enableTerrainPatterns).toBe(true);
    expect(settings.enableHoverEffects).toBe(false); // Disabled on touch
    expect(settings.enableAnimations).toBe(true);
    expect(settings.enableComplexFilters).toBe(false);
    expect(settings.touchThrottleMs).toBe(16);
  });

  it('returns low-tier settings for low-power devices', () => {
    const profile: PerformanceProfile = {
      isMobile: true,
      isLowPower: true,
      prefersReducedMotion: false,
      isTouchPrimary: true,
      devicePixelRatio: 1.5,
      tier: 'low',
    };

    const settings = getOptimizationSettings(profile);
    expect(settings.enableTransitions).toBe(false);
    expect(settings.enableTerrainPatterns).toBe(false);
    expect(settings.enableHoverEffects).toBe(false);
    expect(settings.enableAnimations).toBe(false);
    expect(settings.enableComplexFilters).toBe(false);
    expect(settings.useSimplifiedHexes).toBe(true);
    expect(settings.zoomDebounceMs).toBe(100);
    expect(settings.touchThrottleMs).toBe(32);
  });

  it('returns low-tier settings when reduced motion is preferred', () => {
    const profile: PerformanceProfile = {
      isMobile: false,
      isLowPower: false,
      prefersReducedMotion: true,
      isTouchPrimary: false,
      devicePixelRatio: 2,
      tier: 'low',
    };

    const settings = getOptimizationSettings(profile);
    expect(settings.enableTransitions).toBe(false);
    expect(settings.enableAnimations).toBe(false);
  });
});

describe('Throttle Function', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes immediately on first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1, 2, 3);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1, 2, 3);
  });

  it('throttles subsequent calls within wait period', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(2);
    throttled(3);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);

    // Advance time past throttle period
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(3);
  });

  it('allows calls after wait period', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1);
    vi.advanceTimersByTime(100);
    throttled(2);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('returns the function unchanged when wait is 0', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 0);

    expect(throttled).toBe(fn);
  });

  it('handles multiple rapid calls correctly', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 50);

    // First call goes through immediately
    throttled('a');
    expect(fn).toHaveBeenCalledWith('a');

    // These are throttled
    throttled('b');
    throttled('c');
    throttled('d');

    // Only last value should be scheduled
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('d');
  });
});

describe('RenderBatcher', () => {
  let rafCallback: (() => void) | null = null;

  beforeEach(() => {
    rafCallback = null;
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallback = () => cb(performance.now());
      return 1;
    });
  });

  it('batches multiple callbacks into single animation frame', () => {
    const batcher = new RenderBatcher();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    batcher.schedule(cb1);
    batcher.schedule(cb2);
    batcher.schedule(cb3);

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
    expect(cb3).not.toHaveBeenCalled();

    // Simulate animation frame
    if (rafCallback) {
      rafCallback();
    }

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(1);
  });

  it('clears pending callbacks', () => {
    const batcher = new RenderBatcher();
    const cb = vi.fn();

    batcher.schedule(cb);
    batcher.clear();

    if (rafCallback) {
      rafCallback();
    }

    expect(cb).not.toHaveBeenCalled();
  });

  it('deduplicates same callback', () => {
    const batcher = new RenderBatcher();
    const cb = vi.fn();

    batcher.schedule(cb);
    batcher.schedule(cb);
    batcher.schedule(cb);

    if (rafCallback) {
      rafCallback();
    }

    // Same callback should only be called once (Set deduplication)
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('only schedules one animation frame for multiple schedules', () => {
    const batcher = new RenderBatcher();

    batcher.schedule(() => {});
    batcher.schedule(() => {});
    batcher.schedule(() => {});

    // Should only have called requestAnimationFrame once
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
});
