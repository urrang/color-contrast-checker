export type Color = { r: number; g: number; b: number; a: number };
export type Font = { size: number; weight: number };

export type Result =
    | {
          status: 'assessed';
          foreground: Color;
          background: Color;
          ratio: number;
          large: boolean;
          aa: boolean;
          aaa: boolean;
      }
    | { status: 'indeterminate'; reason: string }
    | { status: 'no-text' };

export type BackgroundLayer = {
    color: string;
    image?: boolean;
    effect?: string;
};
