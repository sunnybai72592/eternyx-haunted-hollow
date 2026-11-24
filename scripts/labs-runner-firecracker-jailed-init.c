#include <sys/reboot.h>
#include <time.h>
#include <unistd.h>
#include <errno.h>
#ifndef ETERNYX_FIXED_DELAY
#error fixed delay required
#endif
#if ETERNYX_FIXED_DELAY != 5 && ETERNYX_FIXED_DELAY != 60
#error unsupported fixed diagnostic delay
#endif
int main(void) {
    static const char marker[] = "ETERNYX_JAILED_GUEST_INIT_OK\n";
    struct timespec delay = { .tv_sec = ETERNYX_FIXED_DELAY, .tv_nsec = 0 };
    if (write(STDOUT_FILENO, marker, sizeof(marker)-1) != sizeof(marker)-1)
        return 1;
    while (nanosleep(&delay, &delay) != 0) {
        if (errno != EINTR) return 1;
    }
    reboot(RB_AUTOBOOT);
    return 1;
}
