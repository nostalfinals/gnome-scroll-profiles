#include <libinput.h>

double libinput_event_pointer_get_scroll_value(
    struct libinput_event_pointer *event,
    enum libinput_pointer_axis axis
)
{
    (void)event;
    return axis == LIBINPUT_POINTER_AXIS_SCROLL_HORIZONTAL ? 20.0 : 10.0;
}
