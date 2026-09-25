// World dimensions and shared tuning constants.
export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 128;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * CHUNK_HEIGHT;
export const SEA_LEVEL = 62;
export const MAX_LIGHT = 15;

// Minecraft-style day: 24000 ticks, 20 ticks per second => 20 minute days.
export const DAY_LENGTH_TICKS = 24000;
export const TICKS_PER_SECOND = 20;

export const GAME_NAME = 'ClaudeCraft';
export const SAVE_VERSION = 1;
