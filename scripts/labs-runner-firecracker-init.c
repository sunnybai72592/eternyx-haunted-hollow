#include <sys/reboot.h>
#include <unistd.h>
int main(void) {
    static const char marker[] = "ETERNYX_FIXED_GUEST_INIT_OK\n";
    if (write(STDOUT_FILENO, marker, sizeof(marker)-1) != sizeof(marker)-1)
        return 1;
    reboot(RB_AUTOBOOT);
    return 1;
}
