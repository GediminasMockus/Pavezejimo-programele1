type ResultError = { message?: string; status?: number };
export async function withRetry<T>(fn: () => PromiseLike<T>, options: { maxRetries?: number; delay?: number; onRetry?: (error: Error, attempt: number) => void } = {}): Promise<T> {
  const { maxRetries = 3, delay = 1000, onRetry } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        const error = result.error as ResultError;
        const status = 'status' in result ? Number(result.status) : error.status;
        if (!(status === 0 || status === 429 || (status != null && status >= 500))) return result;
        if (attempt >= maxRetries) return result;
        throw new Error(error.message || 'Temporary connection error');
      }
      return result;
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      onRetry?.(error instanceof Error ? error : new Error(String(error)), attempt + 1);
      await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
    }
  }
}
