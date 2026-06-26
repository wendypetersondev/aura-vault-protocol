import type { HTMLAttributes, ReactNode, CSSProperties } from "react";

/* ── Stack ─────────────────────────────────────────────────────────
   One-dimensional flex layout with uniform gap.
──────────────────────────────────────────────────────────────────── */
export type StackDirection = "row" | "column";
export type StackAlign     = "start" | "center" | "end" | "stretch" | "baseline";
export type StackJustify   = "start" | "center" | "end" | "between" | "around" | "evenly";
export type SpacingToken   = 0|1|2|3|4|5|6|8|10|12|16|20;

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: StackDirection;
  gap?: SpacingToken;
  align?: StackAlign;
  justify?: StackJustify;
  wrap?: boolean;
}

const alignMap: Record<StackAlign, string> = {
  start: "flex-start", center: "center", end: "flex-end",
  stretch: "stretch", baseline: "baseline",
};
const justifyMap: Record<StackJustify, string> = {
  start: "flex-start", center: "center", end: "flex-end",
  between: "space-between", around: "space-around", evenly: "space-evenly",
};

/** Flexbox-based one-dimensional layout primitive. */
export function Stack({
  direction = "column",
  gap = 4,
  align = "stretch",
  justify = "start",
  wrap = false,
  style,
  children,
  ...props
}: StackProps) {
  const inlineStyle: CSSProperties = {
    display: "flex",
    flexDirection: direction,
    gap: `var(--sp-${gap})`,
    alignItems: alignMap[align],
    justifyContent: justifyMap[justify],
    flexWrap: wrap ? "wrap" : "nowrap",
    ...style,
  };
  return <div style={inlineStyle} {...props}>{children}</div>;
}

/* ── Grid ──────────────────────────────────────────────────────────
   CSS Grid layout with responsive column support.
──────────────────────────────────────────────────────────────────── */
export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: number | string;   // number = repeat(n, 1fr), string = custom template
  gap?: SpacingToken;
  rowGap?: SpacingToken;
  colGap?: SpacingToken;
}

/** CSS grid layout primitive. */
export function Grid({ cols = 2, gap, rowGap, colGap, style, children, ...props }: GridProps) {
  const inlineStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: typeof cols === "number" ? `repeat(${cols}, 1fr)` : cols,
    gap:       gap    !== undefined ? `var(--sp-${gap})`    : undefined,
    rowGap:    rowGap !== undefined ? `var(--sp-${rowGap})` : undefined,
    columnGap: colGap !== undefined ? `var(--sp-${colGap})` : undefined,
    ...style,
  };
  return <div style={inlineStyle} {...props}>{children}</div>;
}

/* ── Container ─────────────────────────────────────────────────────
   Max-width centred page container.
──────────────────────────────────────────────────────────────────── */
export type ContainerSize = "sm" | "md" | "lg" | "xl" | "full";

const maxWidths: Record<ContainerSize, string> = {
  sm:   "640px",
  md:   "768px",
  lg:   "1024px",
  xl:   "1280px",
  full: "100%",
};

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: ContainerSize;
  padded?: boolean;
}

/** Max-width centred container with optional horizontal padding. */
export function Container({ size = "lg", padded = true, style, children, ...props }: ContainerProps) {
  const inlineStyle: CSSProperties = {
    maxWidth: maxWidths[size],
    width: "100%",
    marginInline: "auto",
    paddingInline: padded ? "var(--sp-4)" : undefined,
    ...style,
  };
  return <div style={inlineStyle} {...props}>{children}</div>;
}
