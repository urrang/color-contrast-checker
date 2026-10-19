export type Color = { r: number; g: number; b: number; a: number };
export type Font = { size: number; weight: number };

export type Result =
  | {
      status: 'assessed';
      foreground: Color;
      background: Color;
      font: Font;
      ratio: number;
      large: boolean;
      aa: boolean;
      aaa: boolean;
    }
  | { status: 'indeterminate'; reason: string; font?: Font }
  | { status: 'no-text' };

export type BackgroundLayer = {
  color: string;
  image?: boolean;
  blend?: boolean;
  effect?: string;
};
