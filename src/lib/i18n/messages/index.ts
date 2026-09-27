import type { Locale } from "../config";
import type { Messages } from "../translate";
import { en } from "./en";
import { he } from "./he";

export const MESSAGES: Record<Locale, Messages> = { en, he };
