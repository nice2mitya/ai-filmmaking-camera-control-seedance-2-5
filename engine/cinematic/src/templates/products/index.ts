// The product templates, one file each.
import type { Piece } from "../../piece";
import { PIECE as P01 } from "./p01-frozen-splash-orbit";
import { PIECE as P02 } from "./p02-robot-arm-snap";
import { PIECE as P03 } from "./p03-exploded-build";
import { PIECE as P04 } from "./p04-probe-fly-through";
import { PIECE as P05 } from "./p05-skyline-dive";
import { PIECE as P06 } from "./p06-glambot";
import { PIECE as P06A } from "./p06a-glambot-clean";
import { PIECE as P06F } from "./p06f-glambot-widearc";
import { PIECE as P06E } from "./p06e-glambot-short";
import { PIECE as P06D } from "./p06d-glambot-closeup";
import { PIECE as P06C } from "./p06c-glambot-low";
import { PIECE as P06B } from "./p06b-glambot-mirror";

export const PRODUCT_TEMPLATES: Piece[] = [P01, P02, P03, P04, P05, P06, P06B, P06C, P06D, P06E, P06F, P06A];
