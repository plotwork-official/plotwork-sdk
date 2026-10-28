/** The smallest zoom, 10 percent, unless a very large picture needs less to be seen whole. */
export const VIEWER_MIN_ZOOM = 0.1

/** The largest zoom, 800 percent. */
export const VIEWER_MAX_ZOOM = 8

/** What a zoom button or key multiplies the zoom by. */
export const VIEWER_ZOOM_STEP = 1.25

/** How far an arrow key moves the picture, in pixels. */
export const VIEWER_PAN_STEP = 64

/** The air around a fitted picture, in pixels. */
export const VIEWER_PADDING = 24

/** The most text of a picture the viewer reads. The largest hosted picture is 2 MiB; a response past this is not one. */
export const PICTURE_MAX_BYTES = 3 * 1024 * 1024

/** How long a fetch of a picture may take before it counts as failed, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 15_000

/** The default and the shortest time between two checks for a new version of a live picture, in seconds. */
export const LIVE_INTERVAL_DEFAULT_S = 60
export const LIVE_INTERVAL_MIN_S = 15

/** How far a pointer may move between down and up and still count as a press, not a drag, in pixels. */
export const PRESS_SLOP_PX = 4
