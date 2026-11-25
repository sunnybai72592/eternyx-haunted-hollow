/* Minimal diagnostic PID 1. No shell, IP networking, writable root or user code.
 * Exact compact JSON contract emitted by firecracker-guest-probe.mjs. */
#define _GNU_SOURCE
#include <errno.h>
#include <sys/socket.h>
#include <linux/vm_sockets.h>
#include <openssl/sha.h>
#include <poll.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <sys/reboot.h>
#include <sys/vfs.h>
#include <sys/statvfs.h>
#include <linux/magic.h>

#define PROTOCOL "eternyx-guest-smoke-v1"
#define PREFIX "{\"protocol\":\"" PROTOCOL "\",\"sessionId\":\""
#define MIDDLE "\",\"nonce\":\""
#define SUFFIX "\"}\n"
#define MAX_LINE 512
#define PORT 5501

static int hex(char c) {
    return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
}
static int respond(const char *line, size_t length, char *out, size_t capacity) {
    const size_t p = sizeof(PREFIX)-1, m = sizeof(MIDDLE)-1, z = sizeof(SUFFIX)-1;
    if (length != p+36+m+64+z ||
        memcmp(line,PREFIX,p) || memcmp(line+p+36,MIDDLE,m) ||
        memcmp(line+p+36+m+64,SUFFIX,z)) return -1;
    const char *session=line+p, *nonce=session+36+m;
    for (size_t i=0;i<36;i++) {
        if (i==8 || i==13 || i==18 || i==23) {
            if (session[i]!='-') return -1;
        } else if (!hex(session[i])) return -1;
    }
    for (size_t i=0;i<64;i++) if (!hex(nonce[i])) return -1;
    char input[160], digest[65];
    unsigned char hash[SHA256_DIGEST_LENGTH];
    int n=snprintf(input,sizeof(input),PROTOCOL "\n%.*s\n%.*s",36,session,64,nonce);
    if (n<0 || (size_t)n>=sizeof(input) || !SHA256((unsigned char *)input,(size_t)n,hash)) return -1;
    for (size_t i=0;i<sizeof(hash);i++)
        snprintf(digest+2*i,3,"%02x",(unsigned int)hash[i]);
    n=snprintf(out,capacity,PREFIX "%.*s" MIDDLE "%.*s\",\"digest\":\"%s\",\"guestHealthy\":true}\n",
               36,session,64,nonce,digest);
    return n>=0 && (size_t)n<capacity ? n : -1;
}
static long long millis(void) {
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC,&now)) return -1;
    return (long long)now.tv_sec*1000+now.tv_nsec/1000000;
}
static int ready(int fd, short events, long long deadline) {
    struct pollfd p={.fd=fd,.events=events};
    for (;;) {
        long long now=millis();
        if (now<0 || now>=deadline) return 0;
        int result=poll(&p,1,(int)(deadline-now));
        if (result<0 && errno==EINTR) continue;
        return result>0 && (p.revents&events);
    }
}
static void serve(int fd) {
    char line[MAX_LINE], out[MAX_LINE];
    size_t used=0, sent=0;
    long long now=millis();
    if (now<0) return;
    long long deadline=now+5000;
    while (used<sizeof(line) && ready(fd,POLLIN,deadline)) {
        ssize_t n=recv(fd,line+used,sizeof(line)-used,MSG_DONTWAIT);
        if (n<0 && (errno==EINTR || errno==EAGAIN)) continue;
        if (n<=0) return;
        used+=(size_t)n;
        const char *nl=memchr(line,'\n',used);
        if (!nl) continue;
        if ((size_t)(nl-line)+1!=used) return;
        int length=respond(line,used,out,sizeof(out));
        if (length<0) return;
        while (sent<(size_t)length && ready(fd,POLLOUT,deadline)) {
            n=send(fd,out+sent,(size_t)length-sent,MSG_DONTWAIT|MSG_NOSIGNAL);
            if (n<0 && (errno==EINTR || errno==EAGAIN)) continue;
            if (n<=0) return;
            sent+=(size_t)n;
        }
        return;
    }
}
static int self_test(void) {
    char line[MAX_LINE+1], out[MAX_LINE];
    size_t n=fread(line,1,sizeof(line),stdin);
    if (ferror(stdin) || n>MAX_LINE) return 1;
    int length=respond(line,n,out,sizeof(out));
    if (length<0) return 1;
    return fwrite(out,1,(size_t)length,stdout)==(size_t)length ? 0 : 1;
}
int main(int argc,char **argv) {
    if (getpid()!=1)
        return argc==2 && !strcmp(argv[1],"--self-test") ? self_test() : 1;
    struct statfs filesystem;
    struct statvfs mounts;
    if (statfs("/",&filesystem) || filesystem.f_type!=EXT4_SUPER_MAGIC ||
        statvfs("/",&mounts) || !(mounts.f_flag&ST_RDONLY)) {
        reboot(RB_AUTOBOOT);
        for (;;) pause();
    }
    int server=socket(AF_VSOCK,SOCK_STREAM|SOCK_CLOEXEC,0);
    struct sockaddr_vm addr={.svm_family=AF_VSOCK,.svm_cid=VMADDR_CID_ANY,.svm_port=PORT};
    if (server>=0 && !bind(server,(struct sockaddr *)&addr,sizeof(addr)) && !listen(server,2)) {
        for (;;) {
            struct sockaddr_vm peer={0};
            socklen_t len=sizeof(peer);
            int fd=accept4(server,(struct sockaddr *)&peer,&len,SOCK_CLOEXEC);
            if (fd<0) { if (errno==EINTR) continue; break; }
            if (len==sizeof(peer) && peer.svm_family==AF_VSOCK && peer.svm_cid==VMADDR_CID_HOST)
                serve(fd);
            close(fd);
        }
    }
    if (server>=0) close(server);
    /* A failed service must not masquerade as a healthy guest. */
    reboot(RB_AUTOBOOT);
    for (;;) pause();
}
