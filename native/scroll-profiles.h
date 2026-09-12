#pragma once

#include <glib.h>

G_BEGIN_DECLS

#define SCROLL_PROFILES_API __attribute__((visibility("default")))

/**
 * scroll_profiles_set_factors:
 * @vertical: vertical touchpad scroll factor
 * @horizontal: horizontal touchpad scroll factor
 *
 * Atomically replaces both live scroll factors. Invalid factors fall back to
 * 1.0 so a malformed extension setting cannot disable scrolling.
 */
SCROLL_PROFILES_API void scroll_profiles_set_factors(
    gdouble vertical,
    gdouble horizontal
);

/**
 * scroll_profiles_get_vertical_factor:
 *
 * Returns: the current vertical touchpad scroll factor
 */
SCROLL_PROFILES_API gdouble scroll_profiles_get_vertical_factor(void);

/**
 * scroll_profiles_get_horizontal_factor:
 *
 * Returns: the current horizontal touchpad scroll factor
 */
SCROLL_PROFILES_API gdouble scroll_profiles_get_horizontal_factor(void);

/**
 * scroll_profiles_is_active:
 *
 * Returns: whether this library was loaded as the GNOME Shell input hook
 */
SCROLL_PROFILES_API gboolean scroll_profiles_is_active(void);

G_END_DECLS
