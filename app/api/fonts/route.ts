import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const FONT_EXTENSIONS = new Set(['.woff2', '.woff', '.ttf', '.otf']);

const WEIGHT_MAP: Record<string, number> = {
  thin: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

function parseVariant(fileName: string): { subFamily: string; weight: number; style: string } | null {
  const ext = path.extname(fileName);
  if (!FONT_EXTENSIONS.has(ext.toLowerCase())) return null;

  const baseName = path.basename(fileName, ext);

  // Skip variable font files
  if (baseName.toLowerCase().includes('variablefont')) return null;

  // Split on the last dash: "Roboto_Condensed-BoldItalic" → ["Roboto_Condensed", "BoldItalic"]
  const dashIdx = baseName.lastIndexOf('-');
  if (dashIdx === -1) {
    // No dash — treat the whole name as the sub-family with Regular weight
    return { subFamily: baseName.replace(/_/g, ' '), weight: 400, style: 'normal' };
  }

  const subFamily = baseName.slice(0, dashIdx).replace(/_/g, ' ');
  let variantPart = baseName.slice(dashIdx + 1);

  // Detect italic
  const isItalic = variantPart.toLowerCase().endsWith('italic');
  if (isItalic) {
    variantPart = variantPart.slice(0, -6); // remove "italic" or "Italic"
  }

  // If variant part is empty after removing Italic, it means the file was just "-Italic"
  const weightKey = variantPart.toLowerCase() || 'regular';
  const weight = WEIGHT_MAP[weightKey] ?? 400;
  const style = isItalic ? 'italic' : 'normal';

  return { subFamily, weight, style };
}

export async function GET() {
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');

  if (!fs.existsSync(fontsDir)) {
    return NextResponse.json({ families: [] });
  }

  const folders = fs.readdirSync(fontsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  const familyMap = new Map<string, {
    name: string;
    folder: string;
    variants: { file: string; weight: number; style: string }[];
  }>();

  for (const folder of folders) {
    const folderPath = path.join(fontsDir, folder);
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const parsed = parseVariant(file);
      if (!parsed) continue;

      const key = parsed.subFamily.toLowerCase();
      if (!familyMap.has(key)) {
        familyMap.set(key, {
          name: parsed.subFamily,
          folder,
          variants: [],
        });
      }
      familyMap.get(key)!.variants.push({
        file: `${folder}/${file}`,
        weight: parsed.weight,
        style: parsed.style,
      });
    }
  }

  // Sort variants within each family by weight then style
  const families = Array.from(familyMap.values()).map(f => ({
    ...f,
    variants: f.variants.sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style)),
  }));

  return NextResponse.json({ families });
}
