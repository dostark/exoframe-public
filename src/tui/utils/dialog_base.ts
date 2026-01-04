/**
 * TUI Dialog Base Framework
 *
 * Part of Phase 13.1: Shared TUI Infrastructure
 *
 * Provides base classes and utilities for creating modal dialogs.
 * All dialogs share consistent keyboard handling and rendering.
 */

import { ANSI, colorize, getTheme, padEnd, type TuiTheme, visibleLength } from "./colors.ts";

// ===== Dialog Types =====

export type DialogState = "active" | "confirmed" | "cancelled";

export type DialogResult<T = unknown> =
  | { type: "confirmed"; value: T }
  | { type: "cancelled" };

export interface DialogRenderOptions {
  useColors: boolean;
  width: number;
  height: number;
}

// ===== Box Drawing Characters =====

export const BOX = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  teeLeft: "├",
  teeRight: "┤",
  teeTop: "┬",
  teeBottom: "┴",
  cross: "┼",
  // Double line variants
  doubleHorizontal: "═",
  doubleVertical: "║",
  doubleTopLeft: "╔",
  doubleTopRight: "╗",
  doubleBottomLeft: "╚",
  doubleBottomRight: "╝",
} as const;

// ===== Base Dialog Class =====

/**
 * Abstract base class for all dialogs
 */
export abstract class DialogBase<T = unknown> {
  protected state: DialogState = "active";
  protected focusIndex = 0;
  protected _resultValue?: T;

  isActive(): boolean {
    return this.state === "active";
  }

  getState(): DialogState {
    return this.state;
  }

  getFocusIndex(): number {
    return this.focusIndex;
  }

  abstract getFocusableElements(): string[];
  abstract handleKey(key: string): void;
  abstract render(options: DialogRenderOptions): string[];
  abstract getResult(): DialogResult<T>;

  protected cancel(): void {
    this.state = "cancelled";
  }

  protected confirm(value: T): void {
    this.state = "confirmed";
    this._resultValue = value;
  }

  protected moveFocus(direction: 1 | -1): void {
    const elements = this.getFocusableElements();
    if (elements.length === 0) return;
    this.focusIndex = (this.focusIndex + direction + elements.length) % elements.length;
  }
}

// ===== Confirmation Dialog =====

export interface ConfirmDialogOptions {
  title: string;
  message: string | string[];
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

/**
 * Simple confirmation dialog (Yes/No)
 */
export class ConfirmDialog extends DialogBase<boolean> {
  private options: Required<ConfirmDialogOptions>;

  constructor(options: ConfirmDialogOptions) {
    super();
    this.options = {
      title: options.title,
      message: options.message,
      confirmText: options.confirmText ?? "Yes",
      cancelText: options.cancelText ?? "No",
      destructive: options.destructive ?? false,
    };
  }

  getFocusableElements(): string[] {
    return ["confirm", "cancel"];
  }

  handleKey(key: string): void {
    switch (key) {
      case "left":
      case "right":
      case "tab":
        this.moveFocus(key === "left" ? -1 : 1);
        break;
      case "enter":
        if (this.focusIndex === 0) {
          this.confirm(true);
        } else {
          this.cancel();
        }
        break;
      case "y":
        this.confirm(true);
        break;
      case "n":
      case "escape":
        this.cancel();
        break;
    }
  }

  render(opts: DialogRenderOptions): string[] {
    const theme = getTheme(opts.useColors);
    const innerWidth = Math.min(opts.width - 4, 60);
    const lines: string[] = [];

    // Top border with title
    const titleLine = ` ${this.options.title} `;
    const topBorder = renderBoxTop(innerWidth, titleLine, theme);
    lines.push(topBorder);

    // Empty line
    lines.push(renderBoxLine("", innerWidth, theme));

    // Message lines
    const messages = Array.isArray(this.options.message)
      ? this.options.message
      : wrapToWidth(this.options.message, innerWidth - 4);

    for (const msg of messages) {
      lines.push(renderBoxLine(`  ${msg}`, innerWidth, theme));
    }

    // Empty line
    lines.push(renderBoxLine("", innerWidth, theme));

    // Buttons
    const confirmBtn = renderButton(
      this.options.confirmText,
      this.focusIndex === 0,
      this.options.destructive,
      theme,
    );
    const cancelBtn = renderButton(
      this.options.cancelText,
      this.focusIndex === 1,
      false,
      theme,
    );

    const buttonLine = `${confirmBtn}    ${cancelBtn}`;
    lines.push(renderBoxLineCentered(buttonLine, innerWidth, theme));

    // Empty line
    lines.push(renderBoxLine("", innerWidth, theme));

    // Bottom border
    lines.push(renderBoxBottom(innerWidth, theme));

    return lines;
  }

  getResult(): DialogResult<boolean> {
    if (this.state === "confirmed") {
      return { type: "confirmed", value: true };
    }
    return { type: "cancelled" };
  }
}

// ===== Input Dialog =====

export interface InputDialogOptions {
  title: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
}

/**
 * Single input field dialog
 */
export class InputDialog extends DialogBase<string> {
  private options: Required<InputDialogOptions>;
  private value: string;
  private editing: boolean = false;
  private cursorPos: number = 0;

  constructor(options: InputDialogOptions) {
    super();
    this.options = {
      title: options.title,
      label: options.label,
      placeholder: options.placeholder ?? "",
      defaultValue: options.defaultValue ?? "",
      required: options.required ?? false,
      maxLength: options.maxLength ?? 200,
    };
    this.value = this.options.defaultValue;
    this.cursorPos = this.value.length;
  }

  getFocusableElements(): string[] {
    return ["input", "confirm", "cancel"];
  }

  getValue(): string {
    return this.value;
  }

  isEditing(): boolean {
    return this.editing;
  }

  handleKey(key: string): void {
    if (this.editing) {
      this.handleEditKey(key);
      return;
    }

    switch (key) {
      case "tab":
        this.moveFocus(1);
        break;
      case "shift+tab":
        this.moveFocus(-1);
        break;
      case "up":
        this.moveFocus(-1);
        break;
      case "down":
        this.moveFocus(1);
        break;
      case "enter":
        if (this.focusIndex === 0) {
          this.editing = true;
        } else if (this.focusIndex === 1) {
          if (!this.options.required || this.value.length > 0) {
            this.confirm(this.value);
          }
        } else {
          this.cancel();
        }
        break;
      case "escape":
        this.cancel();
        break;
    }
  }

  private handleEditKey(key: string): void {
    switch (key) {
      case "escape":
        this.editing = false;
        break;
      case "enter":
        this.editing = false;
        this.moveFocus(1);
        break;
      case "backspace":
        if (this.cursorPos > 0) {
          this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
          this.cursorPos--;
        }
        break;
      case "delete":
        if (this.cursorPos < this.value.length) {
          this.value = this.value.slice(0, this.cursorPos) + this.value.slice(this.cursorPos + 1);
        }
        break;
      case "left":
        if (this.cursorPos > 0) this.cursorPos--;
        break;
      case "right":
        if (this.cursorPos < this.value.length) this.cursorPos++;
        break;
      case "home":
        this.cursorPos = 0;
        break;
      case "end":
        this.cursorPos = this.value.length;
        break;
      default:
        // Single character input
        if (key.length === 1 && this.value.length < this.options.maxLength) {
          this.value = this.value.slice(0, this.cursorPos) + key + this.value.slice(this.cursorPos);
          this.cursorPos++;
        }
        break;
    }
  }

  render(opts: DialogRenderOptions): string[] {
    const theme = getTheme(opts.useColors);
    const innerWidth = Math.min(opts.width - 4, 60);
    const lines: string[] = [];

    // Top border with title
    lines.push(renderBoxTop(innerWidth, ` ${this.options.title} `, theme));

    // Empty line
    lines.push(renderBoxLine("", innerWidth, theme));

    // Label
    lines.push(renderBoxLine(`  ${this.options.label}:`, innerWidth, theme));

    // Input field
    const inputWidth = innerWidth - 6;
    const displayValue = this.value || this.options.placeholder;
    const isFocused = this.focusIndex === 0;
    const inputField = renderInputField(
      displayValue,
      inputWidth,
      isFocused,
      this.editing,
      !this.value && !!this.options.placeholder,
      theme,
    );
    lines.push(renderBoxLine(`  ${inputField}`, innerWidth, theme));

    // Empty line
    lines.push(renderBoxLine("", innerWidth, theme));

    // Buttons
    const canConfirm = !this.options.required || this.value.length > 0;
    const confirmBtn = renderButton("OK", this.focusIndex === 1, false, theme, !canConfirm);
    const cancelBtn = renderButton("Cancel", this.focusIndex === 2, false, theme);

    const buttonLine = `${confirmBtn}    ${cancelBtn}`;
    lines.push(renderBoxLineCentered(buttonLine, innerWidth, theme));

    // Empty line
    lines.push(renderBoxLine("", innerWidth, theme));

    // Bottom border
    lines.push(renderBoxBottom(innerWidth, theme));

    return lines;
  }

  getResult(): DialogResult<string> {
    if (this.state === "confirmed" && this._resultValue !== undefined) {
      return { type: "confirmed", value: this._resultValue };
    }
    return { type: "cancelled" };
  }
}

// ===== Select Dialog =====

export interface SelectOption<T = string> {
  value: T;
  label: string;
  description?: string;
}

export interface SelectDialogOptions<T = string> {
  title: string;
  options: SelectOption<T>[];
  selectedIndex?: number;
}

/**
 * Single-select dialog with list of options
 */
export class SelectDialog<T = string> extends DialogBase<T> {
  private options: SelectDialogOptions<T>;
  private selectedIndex: number;
  private scrollOffset: number = 0;
  private maxVisible: number = 8;

  constructor(options: SelectDialogOptions<T>) {
    super();
    this.options = options;
    this.selectedIndex = options.selectedIndex ?? 0;
  }

  getFocusableElements(): string[] {
    return ["list", "confirm", "cancel"];
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  handleKey(key: string): void {
    if (this.focusIndex === 0) {
      // Navigating list
      switch (key) {
        case "up":
          if (this.selectedIndex > 0) {
            this.selectedIndex--;
            if (this.selectedIndex < this.scrollOffset) {
              this.scrollOffset = this.selectedIndex;
            }
          }
          break;
        case "down":
          if (this.selectedIndex < this.options.options.length - 1) {
            this.selectedIndex++;
            if (this.selectedIndex >= this.scrollOffset + this.maxVisible) {
              this.scrollOffset = this.selectedIndex - this.maxVisible + 1;
            }
          }
          break;
        case "tab":
          this.moveFocus(1);
          break;
        case "enter":
          this.confirm(this.options.options[this.selectedIndex].value);
          break;
        case "escape":
          this.cancel();
          break;
      }
    } else {
      switch (key) {
        case "tab":
          this.moveFocus(1);
          break;
        case "shift+tab":
        case "up":
          this.moveFocus(-1);
          break;
        case "enter":
          if (this.focusIndex === 1) {
            this.confirm(this.options.options[this.selectedIndex].value);
          } else {
            this.cancel();
          }
          break;
        case "escape":
          this.cancel();
          break;
      }
    }
  }

  render(opts: DialogRenderOptions): string[] {
    const theme = getTheme(opts.useColors);
    const innerWidth = Math.min(opts.width - 4, 60);
    const lines: string[] = [];

    // Top border with title
    lines.push(renderBoxTop(innerWidth, ` ${this.options.title} `, theme));

    // Empty line
    lines.push(renderBoxLine("", innerWidth, theme));

    // Options list
    const visibleOptions = this.options.options.slice(
      this.scrollOffset,
      this.scrollOffset + this.maxVisible,
    );

    const listFocused = this.focusIndex === 0;

    for (let i = 0; i < visibleOptions.length; i++) {
      const opt = visibleOptions[i];
      const actualIndex = this.scrollOffset + i;
      const isSelected = actualIndex === this.selectedIndex;
      const prefix = isSelected ? (listFocused ? "▶" : "•") : " ";
      const label = `${prefix} ${opt.label}`;
      const styledLabel = isSelected && listFocused ? colorize(label, theme.treeSelected, theme.reset) : label;
      lines.push(renderBoxLine(`  ${styledLabel}`, innerWidth, theme));
    }

    // Scroll indicator
    if (this.options.options.length > this.maxVisible) {
      const canScrollUp = this.scrollOffset > 0;
      const canScrollDown = this.scrollOffset + this.maxVisible < this.options.options.length;
      const scrollIndicator = `${canScrollUp ? "↑" : " "} ${this.scrollOffset + 1}-${
        Math.min(this.scrollOffset + this.maxVisible, this.options.options.length)
      }/${this.options.options.length} ${canScrollDown ? "↓" : " "}`;
      lines.push(renderBoxLineCentered(colorize(scrollIndicator, theme.textDim, theme.reset), innerWidth, theme));
    }

    // Empty line
    lines.push(renderBoxLine("", innerWidth, theme));

    // Buttons
    const confirmBtn = renderButton("Select", this.focusIndex === 1, false, theme);
    const cancelBtn = renderButton("Cancel", this.focusIndex === 2, false, theme);

    const buttonLine = `${confirmBtn}    ${cancelBtn}`;
    lines.push(renderBoxLineCentered(buttonLine, innerWidth, theme));

    // Empty line
    lines.push(renderBoxLine("", innerWidth, theme));

    // Bottom border
    lines.push(renderBoxBottom(innerWidth, theme));

    return lines;
  }

  getResult(): DialogResult<T> {
    if (this.state === "confirmed" && this._resultValue !== undefined) {
      return { type: "confirmed", value: this._resultValue };
    }
    return { type: "cancelled" };
  }
}

// ===== Rendering Helpers =====

/**
 * Render top border with optional title
 */
export function renderBoxTop(width: number, title: string, theme: TuiTheme): string {
  const titleLen = visibleLength(title);
  const leftLen = 2;
  const rightLen = Math.max(0, width - leftLen - titleLen);
  const left = BOX.horizontal.repeat(leftLen);
  const right = BOX.horizontal.repeat(rightLen);
  return colorize(
    `${BOX.topLeft}${left}${title}${right}${BOX.topRight}`,
    theme.border,
    theme.reset,
  );
}

/**
 * Render bottom border
 */
export function renderBoxBottom(width: number, theme: TuiTheme): string {
  return colorize(
    `${BOX.bottomLeft}${BOX.horizontal.repeat(width)}${BOX.bottomRight}`,
    theme.border,
    theme.reset,
  );
}

/**
 * Render a box line with content
 */
export function renderBoxLine(content: string, width: number, theme: TuiTheme): string {
  const paddedContent = padEnd(content, width);
  const border = colorize(BOX.vertical, theme.border, theme.reset);
  return `${border}${paddedContent}${border}`;
}

/**
 * Render a centered box line
 */
export function renderBoxLineCentered(content: string, width: number, theme: TuiTheme): string {
  const contentLen = visibleLength(content);
  const leftPad = Math.floor((width - contentLen) / 2);
  const rightPad = width - contentLen - leftPad;
  const paddedContent = " ".repeat(leftPad) + content + " ".repeat(rightPad);
  const border = colorize(BOX.vertical, theme.border, theme.reset);
  return `${border}${paddedContent}${border}`;
}

/**
 * Render a button
 */
export function renderButton(
  text: string,
  focused: boolean,
  destructive: boolean,
  theme: TuiTheme,
  disabled: boolean = false,
): string {
  const wrapper = focused ? ["[", "]"] : [" ", " "];
  const buttonText = `${wrapper[0]}${text}${wrapper[1]}`;

  if (disabled) {
    return colorize(buttonText, theme.textDim, theme.reset);
  }
  if (focused) {
    if (destructive) {
      return colorize(buttonText, theme.error, theme.reset);
    }
    return colorize(buttonText, theme.primary, theme.reset);
  }
  return buttonText;
}

/**
 * Render an input field
 */
export function renderInputField(
  value: string,
  width: number,
  focused: boolean,
  editing: boolean,
  isPlaceholder: boolean,
  theme: TuiTheme,
): string {
  const displayValue = value.slice(0, width - 2).padEnd(width - 2);
  const borderColor = focused ? theme.borderActive : theme.border;
  const textColor = isPlaceholder ? theme.textDim : "";

  let content = colorize(displayValue, textColor, theme.reset);
  if (editing) {
    content = colorize(displayValue, `${ANSI.inverse}`, theme.reset);
  }

  const leftBracket = colorize("[", borderColor, theme.reset);
  const rightBracket = colorize("]", borderColor, theme.reset);

  return `${leftBracket}${content}${rightBracket}`;
}

/**
 * Wrap text to width
 */
export function wrapToWidth(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}
