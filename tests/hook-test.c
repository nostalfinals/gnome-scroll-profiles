#define _GNU_SOURCE

#include <dlfcn.h>
#include <libinput.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

typedef void (*set_factors_fn)(double vertical, double horizontal);

int main(void)
{
    set_factors_fn set_factors = NULL;
    struct libinput_event_pointer *event = NULL;
    double vertical;
    double horizontal;
    void *symbol;

    dlerror();
    symbol = dlsym(RTLD_DEFAULT, "scroll_profiles_set_factors");
    if (dlerror() != NULL || symbol == NULL) {
        fprintf(stderr, "preload API is unavailable\n");
        return 1;
    }
    memcpy(&set_factors, &symbol, sizeof(set_factors));

    set_factors(0.2, 0.4);
    vertical = libinput_event_pointer_get_scroll_value(
        event,
        LIBINPUT_POINTER_AXIS_SCROLL_VERTICAL
    );
    horizontal = libinput_event_pointer_get_scroll_value(
        event,
        LIBINPUT_POINTER_AXIS_SCROLL_HORIZONTAL
    );

    if (fabs(vertical - 2.0) > 0.0001 ||
        fabs(horizontal - 8.0) > 0.0001) {
        fprintf(
            stderr,
            "unexpected scaled values: vertical=%f horizontal=%f\n",
            vertical,
            horizontal
        );
        return 1;
    }

    return 0;
}
