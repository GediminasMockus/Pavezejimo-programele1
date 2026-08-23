export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delay?: number; onRetry?: (error: Error, attempt: number) => void } = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000, onRetry } = options;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        onRetry?.(lastError, attempt);
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }

  throw lastError!;
}
