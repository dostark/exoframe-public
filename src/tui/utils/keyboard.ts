/**
 * TUI Keyboard Utilities
 *
 * Part of Phase 13.1: Shared TUI Infrastructure
 *
 * Provides keyboard handling utilities for consistent key management.
 */

// ===== Key Types =====

export type KeyModifier = "ctrl" | "alt" | "shift" | "meta";

export interface KeyEvent {
  key: string;
  modifiers: Set<KeyModifier>;
  raw?: string;
}

// ===== Common Key Constants =====

export const KEYS = {
  // Navigation
  UP: "up",
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right",
  HOME: "home",
  END: "end",
  PAGE_UP: "pageup",
  PAGE_DOWN: "pagedown",

  // Actions
  ENTER: "enter",
  ESCAPE: "escape",
  TAB: "tab",
  SPACE: "space",
  BACKSPACE: "backspace",
  DELETE: "delete",

  // Common shortcuts
  CTRL_C: "ctrl+c",
  CTRL_D: "ctrl+d",
  CTRL_Q: "ctrl+q",
  CTRL_S: "ctrl+s",
  CTRL_R: "ctrl+r",
  CTRL_L: "ctrl+l",
} as const;

// ===== Key Binding =====

export interface KeyBinding<T = string> {
  key: string;
  modifiers?: KeyModifier[];
  action: T;
  description: string;
  category?: string;
  global?: boolean;
}

export interface KeyBindingGroup<T = string> {
  name: string;
  bindings: KeyBinding<T>[];
}

// ===== Key Handler Types =====

export type KeyHandler = (key: string) => boolean | void | Promise<boolean | void>;

export interface KeyHandlerMap {
  [key: string]: KeyHandler;
}

// ===== Keyboard Manager =====

/**
 * Manages keyboard bindings and handlers
 */
export class KeyboardManager<TAction extends string = string> {
  private bindings: Map<string, KeyBinding<TAction>> = new Map();
  private handlers: Map<TAction, KeyHandler> = new Map();
  private enabled: boolean = true;

  /**
   * Register a key binding
   */
  bind(binding: KeyBinding<TAction>): this {
    const key = this.normalizeKey(binding.key, binding.modifiers);
    this.bindings.set(key, binding);
    return this;
  }

  /**
   * Register multiple bindings
   */
  bindAll(bindings: KeyBinding<TAction>[]): this {
    for (const binding of bindings) {
      this.bind(binding);
    }
    return this;
  }

  /**
   * Register a handler for an action
   */
  on(action: TAction, handler: KeyHandler): this {
    this.handlers.set(action, handler);
    return this;
  }

  /**
   * Handle a key press
   * Returns true if the key was handled
   */
  async handle(key: string): Promise<boolean> {
    if (!this.enabled) return false;

    const normalizedKey = this.normalizeKey(key);
    const binding = this.bindings.get(normalizedKey);

    if (!binding) return false;

    const handler = this.handlers.get(binding.action);
    if (!handler) return false;

    const result = await handler(key);
    return result !== false;
  }

  /**
   * Get all bindings
   */
  getBindings(): KeyBinding<TAction>[] {
    return Array.from(this.bindings.values());
  }

  /**
   * Get bindings grouped by category
   */
  getBindingsByCategory(): Map<string, KeyBinding<TAction>[]> {
    const groups = new Map<string, KeyBinding<TAction>[]>();

    for (const binding of this.bindings.values()) {
      const category = binding.category ?? "General";
      const list = groups.get(category) ?? [];
      list.push(binding);
      groups.set(category, list);
    }

    return groups;
  }

  /**
   * Check if a binding exists for a key
   */
  hasBinding(key: string): boolean {
    return this.bindings.has(this.normalizeKey(key));
  }

  /**
   * Enable keyboard handling
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable keyboard handling
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Normalize key string for consistent matching
   */
  private normalizeKey(key: string, modifiers?: KeyModifier[]): string {
    let normalized = key.toLowerCase();

    // Already has modifiers in string form
    if (normalized.includes("+")) {
      const parts = normalized.split("+");
      const mods = parts.slice(0, -1).sort();
      normalized = [...mods, parts[parts.length - 1]].join("+");
    } else if (modifiers && modifiers.length > 0) {
      // Add modifiers prefix
      const sortedMods = [...modifiers].sort();
      normalized = `${sortedMods.join("+")}+${normalized}`;
    }

    return normalized;
  }
}

// ===== Common Navigation Handlers =====

export interface NavigationState {
  selectedIndex: number;
  length: number;
  pageSize?: number;
}

/**
 * Create navigation key handlers
 */
export function createNavigationHandlers(
  getState: () => NavigationState,
  setState: (index: number) => void,
): KeyHandlerMap {
  return {
    up: () => {
      const state = getState();
      if (state.selectedIndex > 0) {
        setState(state.selectedIndex - 1);
        return true;
      }
      return false;
    },
    down: () => {
      const state = getState();
      if (state.selectedIndex < state.length - 1) {
        setState(state.selectedIndex + 1);
        return true;
      }
      return false;
    },
    home: () => {
      setState(0);
      return true;
    },
    end: () => {
      const state = getState();
      setState(Math.max(0, state.length - 1));
      return true;
    },
    pageup: () => {
      const state = getState();
      const pageSize = state.pageSize ?? 10;
      setState(Math.max(0, state.selectedIndex - pageSize));
      return true;
    },
    pagedown: () => {
      const state = getState();
      const pageSize = state.pageSize ?? 10;
      setState(Math.min(state.length - 1, state.selectedIndex + pageSize));
      return true;
    },
  };
}

// ===== Key Parsing =====

/**
 * Parse raw key input to KeyEvent
 */
export function parseKey(raw: string): KeyEvent {
  const modifiers = new Set<KeyModifier>();
  let key = raw.toLowerCase();

  // Check for modifier prefixes
  if (key.startsWith("ctrl+") || key.startsWith("c-")) {
    modifiers.add("ctrl");
    key = key.replace(/^(ctrl\+|c-)/, "");
  }
  if (key.startsWith("alt+") || key.startsWith("m-")) {
    modifiers.add("alt");
    key = key.replace(/^(alt\+|m-)/, "");
  }
  if (key.startsWith("shift+") || key.startsWith("s-")) {
    modifiers.add("shift");
    key = key.replace(/^(shift\+|s-)/, "");
  }
  if (key.startsWith("meta+") || key.startsWith("super+")) {
    modifiers.add("meta");
    key = key.replace(/^(meta\+|super\+)/, "");
  }

  return { key, modifiers, raw };
}

/**
 * Format key for display
 */
export function formatKey(key: string, modifiers?: KeyModifier[]): string {
  const parts: string[] = [];

  if (modifiers) {
    if (modifiers.includes("ctrl")) parts.push("Ctrl");
    if (modifiers.includes("alt")) parts.push("Alt");
    if (modifiers.includes("shift")) parts.push("Shift");
    if (modifiers.includes("meta")) parts.push("Meta");
  }

  // Capitalize special keys
  const displayKey = key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);

  parts.push(displayKey);

  return parts.join("+");
}

/**
 * Check if key matches a pattern
 */
export function matchesKey(key: string, pattern: string): boolean {
  const keyEvent = parseKey(key);
  const patternEvent = parseKey(pattern);

  if (keyEvent.key !== patternEvent.key) return false;

  // Check all modifiers match
  if (keyEvent.modifiers.size !== patternEvent.modifiers.size) return false;
  for (const mod of patternEvent.modifiers) {
    if (!keyEvent.modifiers.has(mod)) return false;
  }

  return true;
}

// ===== Help Screen Generation =====

/**
 * Generate help screen content from key bindings
 */
export function generateHelpScreen<T extends string>(
  bindings: KeyBinding<T>[],
  options: { title?: string; useColors?: boolean } = {},
): string[] {
  const { title = "Keyboard Shortcuts", useColors = true } = options;
  const lines: string[] = [];

  // Group by category
  const categories = new Map<string, KeyBinding<T>[]>();
  for (const binding of bindings) {
    const cat = binding.category ?? "General";
    const list = categories.get(cat) ?? [];
    list.push(binding);
    categories.set(cat, list);
  }

  // Title
  if (useColors) {
    lines.push(`\x1b[1;36m${title}\x1b[0m`);
  } else {
    lines.push(title);
  }
  lines.push("");

  // Render each category
  for (const [category, catBindings] of categories) {
    if (useColors) {
      lines.push(`\x1b[1m${category}\x1b[0m`);
    } else {
      lines.push(category);
    }

    for (const binding of catBindings) {
      const keyStr = formatKey(binding.key, binding.modifiers);
      const keyDisplay = keyStr.padEnd(15);

      if (useColors) {
        lines.push(`  \x1b[33m${keyDisplay}\x1b[0m ${binding.description}`);
      } else {
        lines.push(`  ${keyDisplay} ${binding.description}`);
      }
    }

    lines.push("");
  }

  return lines;
}
