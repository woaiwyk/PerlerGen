import { Palette } from "./types";

import { MARD_221_COLORS } from "./beads/mard221";
import { MARD_291_COLORS } from "./beads/mard291";
import { MARD_264_COLORS } from "./beads/mard264";
import { MARD_96_COLORS } from "./beads/mard96";
import { MARD_144_COLORS } from "./beads/mard144";

// Re-export colors and utils

export { MARD_221_COLORS } from "./beads/mard221";
export { MARD_291_COLORS } from "./beads/mard291";
export { MARD_264_COLORS } from "./beads/mard264";
export { MARD_96_COLORS } from "./beads/mard96";
export { MARD_144_COLORS } from "./beads/mard144";

export { hexToRgb, getColorDistance } from "./beads/utils";

export const AVAILABLE_PALETTES: Palette[] = [
  {
    id: "mard_221",
    name: "Mard Beads (221 Colors) / M豆221色",
    colors: MARD_221_COLORS,
  },
  {
    id: "mard_291",
    name: "Mard Beads (291 Colors) / M豆291色",
    colors: MARD_291_COLORS,
  },
  {
    id: "mard_264",
    name: "Mard Beads (264 Colors) / M豆264色",
    colors: MARD_264_COLORS,
  },
  {
    id: "mard_96",
    name: "Mard Beads (96 Colors) / M豆96色",
    colors: MARD_96_COLORS,
  },
  {
    id: "mard_144",
    name: "Mard Beads (144 Colors) / M豆144色",
    colors: MARD_144_COLORS,
  },
];
