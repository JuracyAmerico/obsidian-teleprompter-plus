// Launches a helper as its OWN TCC-responsible process (via responsibility disclaim) so macOS
// evaluates the HELPER's Info.plist usage descriptions, not the parent app's (Obsidian).
// Forwards SIGTERM/SIGINT to the child so the plugin can stop the (reparented) sidecar.
// Usage: disclaim-launcher <real-binary> [args...]
#include <spawn.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
#include <sys/wait.h>
extern char **environ;
extern int responsibility_spawnattrs_setdisclaim(posix_spawnattr_t *attrs, int disclaim);
static pid_t child_pid = 0;
static void forward(int sig) { if (child_pid > 0) kill(child_pid, sig); }
int main(int argc, char **argv) {
    if (argc < 2) return 2;
    posix_spawnattr_t attr;
    posix_spawnattr_init(&attr);
    responsibility_spawnattrs_setdisclaim(&attr, 1);
    signal(SIGTERM, forward);
    signal(SIGINT, forward);
    int rc = posix_spawn(&child_pid, argv[1], NULL, &attr, &argv[1], environ); // inherits our stdio
    posix_spawnattr_destroy(&attr);
    if (rc != 0) return rc;
    int status;
    while (waitpid(child_pid, &status, 0) < 0) { /* retry on EINTR */ }
    return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
}
