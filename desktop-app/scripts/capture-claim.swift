import Darwin

// Use a non-blocking advisory lock so App and Chromium agree on one capture
// owner. Stopping or crashing either parent closes the helper's stdin.
guard CommandLine.arguments.count == 2 else { exit(1) }
let lock = open(CommandLine.arguments[1], O_CREAT | O_RDWR | O_NOFOLLOW, mode_t(S_IRUSR | S_IWUSR))
guard lock >= 0 else { exit(1) }
guard flock(lock, LOCK_EX | LOCK_NB) == 0 else { exit(errno == EWOULDBLOCK ? 75 : 1) }
var ready: UInt8 = 49
guard write(STDOUT_FILENO, &ready, 1) == 1 else { exit(1) }
var byte: UInt8 = 0
while true {
    let count = read(STDIN_FILENO, &byte, 1)
    if count == 0 || (count < 0 && errno != EINTR) { break }
}
close(lock)
