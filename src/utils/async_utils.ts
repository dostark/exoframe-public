/**
 * Async utilities for non-blocking operations
 */

/**
 * Non-blocking delay utility
 * @param ms Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
