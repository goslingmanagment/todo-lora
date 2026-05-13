export const POSTGRES_INT_MAX = 2_147_483_647;

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export const MAX_DOLLARS_INPUT = Math.floor(POSTGRES_INT_MAX / 100);
export const MAX_MINUTES_INPUT = Math.floor(POSTGRES_INT_MAX / 60);
export const MAX_COUNT_INPUT = POSTGRES_INT_MAX;
