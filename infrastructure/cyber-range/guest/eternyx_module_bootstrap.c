/* Fixed diagnostic guest PID 1. Never invoked by the host builder. */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <sys/mount.h>
#include <sys/reboot.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>
#if !defined(MODULE_COUNT) || MODULE_COUNT < 1 || MODULE_COUNT > 64
#error Invalid fixed module count
#endif

static _Noreturn void fail(void) {
    static const char msg[]="ETERNYX_MODULE_BOOTSTRAP_FAILED\n";
    if (write(STDERR_FILENO,msg,sizeof(msg)-1)<0) {
        /* Diagnostic output is best-effort; always proceed to reboot. */
    }
    reboot(RB_AUTOBOOT);
    for (;;) pause();
}
int main(void) {
    if (getpid()!=1) return 1;
    for (unsigned int i=0;i<MODULE_COUNT;i++) {
        char path[32];
        if (snprintf(path,sizeof(path),"/modules/%03u.ko",i)<=0) fail();
        int fd=open(path,O_RDONLY|O_CLOEXEC|O_NOFOLLOW);
        if (fd<0) fail();
        long rc=syscall(SYS_finit_module,fd,"",0);
        int error=errno;
        close(fd);
        if (rc!=0 && error!=EEXIST) fail();
    }
    if (mount("devtmpfs","/dev","devtmpfs",MS_NOSUID|MS_NOEXEC,NULL)!=0 && errno!=EBUSY)
        fail();
    for (unsigned int i=0;i<100;i++) {
        struct stat st;
        if (stat("/dev/vda",&st)==0 && S_ISBLK(st.st_mode)) {
            if (mount("/dev/vda","/newroot","ext4",MS_RDONLY|MS_NOSUID|MS_NODEV,NULL)==0) {
                if (chdir("/newroot") || chroot(".") || chdir("/")) fail();
                execl("/sbin/init","/sbin/init",(char *)NULL);
                fail();
            }
        }
        struct timespec delay={.tv_sec=0,.tv_nsec=100000000};
        nanosleep(&delay,NULL);
    }
    fail();
}
