#define _GNU_SOURCE
#include <fcntl.h>
#include <linux/kvm.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#if !defined(__linux__) || !defined(__x86_64__)
#error "This diagnostic is restricted to x86-64 Linux"
#endif

/* Fixed trusted real-mode instructions: MOV AX,0x4b56; HLT.
 * No uploaded code, disk, network, MMIO emulation or guest inputs. */
static const unsigned char guest[] = {0xb8, 0x56, 0x4b, 0xf4};
static bool result_matches(uint32_t reason, uint64_t ax, uint64_t rip) {
    return reason == KVM_EXIT_HLT && ax == 0x4b56 && rip == sizeof(guest);
}

static bool approved(void) {
    const char *ci = getenv("GITHUB_ACTIONS");
    const char *consent = getenv("ETERNYX_GUEST_CPU_APPROVAL");
    return geteuid() == 0 && ci && strcmp(ci, "true") == 0 &&
        consent && strcmp(consent, "I_APPROVE_EPHEMERAL_KVM_GUEST_CPU") == 0;
}

static int run_guest(void) {
    int kvm = -1, vm = -1, cpu = -1, run_size = 0;
    void *mem = MAP_FAILED;
    struct kvm_run *run = MAP_FAILED;
    struct stat before, after;
    struct kvm_sregs sregs;
    struct kvm_regs regs = {.rip = 0, .rflags = 2};
    bool executed = false, cleanup = true;
    const char *stage = "device";
    const size_t bytes = 4096;
    /* Hard process deadline, including ioctl and cleanup. The runner adds
       an external timeout as well. Kernel closes descriptors on process exit. */
    alarm(10);
    if (lstat("/dev/kvm", &before) || !S_ISCHR(before.st_mode)) goto out;
    kvm = open("/dev/kvm", O_RDWR | O_CLOEXEC | O_NOFOLLOW);
    if (kvm < 0 || fstat(kvm, &after) || !S_ISCHR(after.st_mode) ||
        before.st_dev != after.st_dev || before.st_ino != after.st_ino ||
        before.st_rdev != after.st_rdev) goto out;
    stage = "api_version";
    if (ioctl(kvm, KVM_GET_API_VERSION, 0) != 12) goto out;
    stage = "vm_create";
    vm = ioctl(kvm, KVM_CREATE_VM, 0);
    if (vm < 0) goto out;
    stage = "tss";
    int tss_cap = ioctl(kvm, KVM_CHECK_EXTENSION, KVM_CAP_SET_TSS_ADDR);
    if (tss_cap < 0 || (tss_cap > 0 && ioctl(vm, KVM_SET_TSS_ADDR, 0xfffbd000UL) < 0)) goto out;
    stage = "memory";
    mem = mmap(NULL, bytes, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (mem == MAP_FAILED) goto out;
    memcpy(mem, guest, sizeof(guest));
    struct kvm_userspace_memory_region region = {
        .slot = 0, .guest_phys_addr = 0, .memory_size = bytes,
        .userspace_addr = (uint64_t)(uintptr_t)mem
    };
    if (ioctl(vm, KVM_SET_USER_MEMORY_REGION, &region) < 0) goto out;
    stage = "vcpu_create";
    cpu = ioctl(vm, KVM_CREATE_VCPU, 0);
    if (cpu < 0) goto out;
    stage = "vcpu_map";
    run_size = ioctl(kvm, KVM_GET_VCPU_MMAP_SIZE, 0);
    if (run_size < (int)sizeof(*run) || run_size > 16 * 1024 * 1024) goto out;
    run = mmap(NULL, (size_t)run_size, PROT_READ | PROT_WRITE, MAP_SHARED, cpu, 0);
    if (run == MAP_FAILED) goto out;
    stage = "register_setup";
    if (ioctl(cpu, KVM_GET_SREGS, &sregs) < 0) goto out;
    sregs.cs.base = 0;
    sregs.cs.selector = 0;
    if (ioctl(cpu, KVM_SET_SREGS, &sregs) < 0 ||
        ioctl(cpu, KVM_SET_REGS, &regs) < 0) goto out;
    stage = "guest_run";
    /* Exactly one entry; any unexpected exit, interrupt or error fails. */
    if (ioctl(cpu, KVM_RUN, 0) < 0 || ioctl(cpu, KVM_GET_REGS, &regs) < 0) goto out;
    stage = "guest_result";
    if (!result_matches(run->exit_reason, regs.rax, regs.rip)) goto out;
    executed = true;
    stage = "cleanup";
out:
    if (run != MAP_FAILED && munmap(run, (size_t)run_size) != 0) cleanup = false;
    if (cpu >= 0 && close(cpu) != 0) cleanup = false;
    if (vm >= 0 && close(vm) != 0) cleanup = false;
    if (mem != MAP_FAILED && munmap(mem, bytes) != 0) cleanup = false;
    if (kvm >= 0 && close(kvm) != 0) cleanup = false;
    alarm(0);
    if (!executed || !cleanup) {
        fprintf(stderr, "Guest CPU diagnostic failed at %s; cleanup=%s\n",
                stage, cleanup ? "true" : "false");
        return 1;
    }
    puts("{\"guestCpuExecutionVerified\":true,\"guestHaltVerified\":true,"
         "\"descriptorCleanupVerified\":true,\"guestBytes\":4,\"guestMemoryBytes\":4096,"
         "\"virtualCpus\":1,\"firecrackerBootVerified\":false,"
         "\"hardwareAcceptanceVerified\":false,\"providerActivationAllowed\":false,"
         "\"productionReleaseReady\":false}");
    return 0;
}

int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "--self-test") == 0) {
        if (!result_matches(KVM_EXIT_HLT, 0x4b56, 4) ||
            result_matches(KVM_EXIT_IO, 0x4b56, 4) ||
            result_matches(KVM_EXIT_HLT, 0, 4) ||
            result_matches(KVM_EXIT_HLT, 0x4b56, 3)) return 1;
        puts("Four guest result contract assertions passed; no KVM opened");
        return 0;
    }
    if (argc != 2 || strcmp(argv[1], "--run") != 0 || !approved()) {
        fputs("Explicit standard-runner guest CPU approval required\n", stderr);
        return 2;
    }
    return run_guest();
}
