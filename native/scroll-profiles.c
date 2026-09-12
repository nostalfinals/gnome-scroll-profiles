#define _GNU_SOURCE

#include "scroll-profiles.h"

#include <dlfcn.h>
#include <libinput.h>
#include <math.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define SCROLL_PROFILES_PRELOAD_MARKER "SCROLL_PROFILES_PRELOAD"
#define FACTOR_MIN 0.01
#define FACTOR_MAX 10.0
#define DEFAULT_FACTORS UINT64_C(0x3f8000003f800000)

typedef double (*scroll_value_fn)(
    struct libinput_event_pointer *event,
    enum libinput_pointer_axis axis
);

static _Atomic uint64_t live_factors = DEFAULT_FACTORS;
static pthread_once_t init_once = PTHREAD_ONCE_INIT;
static scroll_value_fn real_scroll_value = NULL;
static gboolean hook_active = FALSE;

static float valid_factor(double factor)
{
    if (!isfinite(factor) || factor < FACTOR_MIN || factor > FACTOR_MAX)
        return 1.0f;

    return (float)factor;
}

static uint32_t float_bits(float value)
{
    uint32_t bits;

    memcpy(&bits, &value, sizeof(bits));
    return bits;
}

static float bits_float(uint32_t bits)
{
    float value;

    memcpy(&value, &bits, sizeof(value));
    return value;
}

static uint64_t pack_factors(double vertical, double horizontal)
{
    return (uint64_t)float_bits(valid_factor(vertical)) |
        ((uint64_t)float_bits(valid_factor(horizontal)) << 32);
}

static void unpack_factors(uint64_t packed, float *vertical, float *horizontal)
{
    *vertical = bits_float((uint32_t)packed);
    *horizontal = bits_float((uint32_t)(packed >> 32));
}

static void initialize_hook(void)
{
    const char *preload_marker = getenv(SCROLL_PROFILES_PRELOAD_MARKER);
    void *symbol;

    dlerror();
    symbol = dlsym(RTLD_NEXT, "libinput_event_pointer_get_scroll_value");
    if (dlerror() == NULL)
        memcpy(&real_scroll_value, &symbol, sizeof(real_scroll_value));

    hook_active = preload_marker != NULL &&
        strcmp(preload_marker, "1") == 0 &&
        real_scroll_value != NULL;

    if (preload_marker != NULL) {
        unsetenv("LD_PRELOAD");
        unsetenv(SCROLL_PROFILES_PRELOAD_MARKER);
    }
}

__attribute__((constructor))
static void scroll_profiles_initialize(void)
{
    pthread_once(&init_once, initialize_hook);
}

void scroll_profiles_set_factors(double vertical, double horizontal)
{
    atomic_store_explicit(
        &live_factors,
        pack_factors(vertical, horizontal),
        memory_order_release
    );
}

double scroll_profiles_get_vertical_factor(void)
{
    float vertical;
    float horizontal;

    unpack_factors(
        atomic_load_explicit(&live_factors, memory_order_acquire),
        &vertical,
        &horizontal
    );
    return vertical;
}

double scroll_profiles_get_horizontal_factor(void)
{
    float vertical;
    float horizontal;

    unpack_factors(
        atomic_load_explicit(&live_factors, memory_order_acquire),
        &vertical,
        &horizontal
    );
    return horizontal;
}

gboolean scroll_profiles_is_active(void)
{
    pthread_once(&init_once, initialize_hook);
    return hook_active;
}

SCROLL_PROFILES_API double libinput_event_pointer_get_scroll_value(
    struct libinput_event_pointer *event,
    enum libinput_pointer_axis axis
)
{
    float vertical;
    float horizontal;
    double value;

    pthread_once(&init_once, initialize_hook);
    if (real_scroll_value == NULL)
        return 0.0;

    value = real_scroll_value(event, axis);
    if (!hook_active || value == 0.0)
        return value;

    unpack_factors(
        atomic_load_explicit(&live_factors, memory_order_acquire),
        &vertical,
        &horizontal
    );

    if (axis == LIBINPUT_POINTER_AXIS_SCROLL_HORIZONTAL)
        return value * horizontal;

    return value * vertical;
}
