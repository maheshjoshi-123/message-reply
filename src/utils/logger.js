function timestamp() {
  return new Date().toISOString();
}

function write(level, ...args) {
  console[level](`[${timestamp()}]`, ...args);
}

export function info(...args) {
  write("log", ...args);
}

export function warn(...args) {
  write("warn", ...args);
}

export function error(...args) {
  write("error", ...args);
}
