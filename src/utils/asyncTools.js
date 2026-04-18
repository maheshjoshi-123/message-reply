export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withRetries(task, options = {}) {
  const retries = Number.isInteger(options.retries) ? options.retries : 0;
  const retryDelayMs =
    typeof options.retryDelayMs === "number" ? options.retryDelayMs : 250;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= retries) {
        break;
      }

      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}

export async function withTimeout(task, timeoutMs, onTimeout) {
  let timer;

  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((resolve, reject) => {
        timer = setTimeout(async () => {
          try {
            if (typeof onTimeout === "function") {
              resolve(await onTimeout());
              return;
            }

            reject(new Error("Operation timed out."));
          } catch (error) {
            reject(error);
          }
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
