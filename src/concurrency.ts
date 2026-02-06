/**
 * Simple concurrency limiter for parallel task execution.
 *
 * This provides a way to run async tasks with a maximum concurrency limit,
 * similar to p-limit but without external dependencies.
 */

/**
 * Execution strategy interface for future extensibility.
 * Allows implementing different strategies like:
 * - Simple pool (current implementation)
 * - Framework-grouped execution
 * - Provider-aware rate limiting
 */
export interface ExecutionStrategy<T, R> {
  execute(tasks: T[], fn: (task: T) => Promise<R>): Promise<R[]>;
}

/**
 * Creates a concurrency limiter function.
 *
 * @param concurrency Maximum number of concurrent executions
 * @returns A function that wraps async functions to limit concurrency
 *
 * @example
 * const limit = createLimiter(3);
 * const results = await Promise.all(
 *   tasks.map(task => limit(() => processTask(task)))
 * );
 */
export function createLimiter(concurrency: number) {
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const nextFn = queue.shift()!;
      nextFn();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

/**
 * Simple pool-based execution strategy.
 * Runs up to N tasks concurrently, regardless of task type.
 */
export class PoolExecutionStrategy<T, R> implements ExecutionStrategy<T, R> {
  constructor(private concurrency: number) {}

  async execute(tasks: T[], fn: (task: T) => Promise<R>): Promise<R[]> {
    if (this.concurrency <= 1) {
      // Sequential execution
      const results: R[] = [];
      for (const task of tasks) {
        results.push(await fn(task));
      }
      return results;
    }

    // Parallel execution with concurrency limit
    const limit = createLimiter(this.concurrency);
    return Promise.all(tasks.map((task) => limit(() => fn(task))));
  }
}
