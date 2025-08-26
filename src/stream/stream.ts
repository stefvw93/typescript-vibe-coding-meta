/**
 * Observer interface for subscribing to stream values
 */
export interface Observer<T> {
  next: (value: T) => void;
  error?: (error: Error) => void;
  complete?: () => void;
}

/**
 * Subscription handle for managing stream subscriptions
 */
export interface Subscription {
  unsubscribe(): void;
  readonly closed: boolean;
}

/**
 * Configuration for backpressure handling strategies
 */
export interface BackpressureConfig {
  strategy: "buffer" | "drop" | "dropOldest" | "throttle" | "pause";
  bufferSize?: number;
  interval?: number;
}

/**
 * Producer function type for creating streams
 */
export type Producer<T> = (observer: Observer<T>) => (() => void) | void;

/**
 * Rich functional reactive Stream implementation with backpressure support
 */
class Stream<T> {
  private producer: Producer<T>;

  constructor(producer: Producer<T>) {
    this.producer = producer;
  }
  /**
   * Creates a stream from an iterable or async iterable source
   */
  static from<T>(source: Iterable<T> | AsyncIterable<T>): Stream<T> {
    return new Stream<T>((observer) => {
      let cancelled = false;

      const iterate = async () => {
        try {
          for await (const value of source) {
            if (cancelled) break;
            observer.next(value);
          }
          if (!cancelled && observer.complete) {
            observer.complete();
          }
        } catch (error) {
          if (!cancelled && observer.error) {
            observer.error(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      };

      iterate();

      return () => {
        cancelled = true;
      };
    });
  }

  /**
   * Creates a stream from individual values
   */
  static of<T>(...values: T[]): Stream<T> {
    return Stream.from(values);
  }

  /**
   * Creates an empty stream that completes immediately
   */
  static empty<T>(): Stream<T> {
    return new Stream<T>((observer) => {
      if (observer.complete) {
        observer.complete();
      }
    });
  }

  /**
   * Creates a stream that never emits or completes
   */
  static never<T>(): Stream<T> {
    return new Stream<T>(() => {});
  }

  /**
   * Creates a stream that immediately errors
   */
  static throw<T>(error: Error): Stream<T> {
    return new Stream<T>((observer) => {
      if (observer.error) {
        observer.error(error);
      }
    });
  }

  /**
   * Creates a stream from a promise
   */
  static fromPromise<T>(promise: Promise<T>): Stream<T> {
    return new Stream<T>((observer) => {
      promise
        .then((value) => {
          observer.next(value);
          if (observer.complete) {
            observer.complete();
          }
        })
        .catch((error) => {
          if (observer.error) {
            observer.error(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        });
    });
  }

  /**
   * Creates a stream that emits incrementing numbers at intervals
   */
  static interval(ms: number): Stream<number> {
    return new Stream<number>((observer) => {
      let count = 0;
      const intervalId = setInterval(() => {
        observer.next(count++);
      }, ms);

      return () => {
        clearInterval(intervalId);
      };
    });
  }

  /**
   * Creates a stream of numbers within a range
   */
  static range(start: number, end: number, step: number = 1): Stream<number> {
    return new Stream<number>((observer) => {
      const values: number[] = [];
      if (step > 0) {
        for (let i = start; i <= end; i += step) {
          values.push(i);
        }
      } else if (step < 0) {
        for (let i = start; i >= end; i += step) {
          values.push(i);
        }
      }

      for (const value of values) {
        observer.next(value);
      }
      if (observer.complete) {
        observer.complete();
      }
    });
  }

  /**
   * Subscribes to the stream with an observer
   */
  subscribe(observer: Observer<T>): Subscription {
    let closed = false;
    const cleanup = this.producer(observer);

    return {
      unsubscribe(): void {
        if (!closed) {
          closed = true;
          if (cleanup) {
            cleanup();
          }
        }
      },
      get closed(): boolean {
        return closed;
      },
    };
  }

  /**
   * Executes a function for each stream value
   */
  forEach(fn: (value: T) => void | Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const queue: Promise<void>[] = [];
      this.subscribe({
        next: (value) => {
          const promise = Promise.resolve(fn(value)).catch(reject);
          queue.push(promise);
        },
        error: reject,
        complete: async () => {
          await Promise.all(queue);
          resolve();
        },
      });
    });
  }

  /**
   * Collects all stream values into an array
   */
  toArray(): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      const values: T[] = [];
      this.subscribe({
        next: (value) => values.push(value),
        error: reject,
        complete: () => resolve(values),
      });
    });
  }

  /**
   * Gets the first value from the stream
   */
  first(): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      let hasValue = false;
      const subscription = this.subscribe({
        next: (value) => {
          hasValue = true;
          resolve(value);
          subscription.unsubscribe();
        },
        error: reject,
        complete: () => {
          if (!hasValue) {
            resolve(undefined);
          }
        },
      });
    });
  }

  /**
   * Gets the last value from the stream
   */
  last(): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve, reject) => {
      let lastValue: T | undefined = undefined;
      let hasValue = false;
      this.subscribe({
        next: (value) => {
          lastValue = value;
          hasValue = true;
        },
        error: reject,
        complete: () => resolve(hasValue ? lastValue : undefined),
      });
    });
  }

  /**
   * Configures backpressure handling for the stream
   */
  withBackpressure(config: BackpressureConfig): Stream<T> {
    return new Stream<T>((observer) => {
      const buffer: T[] = [];
      const bufferSize = config.bufferSize || 1000;
      let lastEmitTime = 0;
      let paused = false;

      const handleValue = (value: T) => {
        switch (config.strategy) {
          case "buffer":
            if (buffer.length < bufferSize) {
              buffer.push(value);
              processBuffer();
            } else {
              if (observer.error) {
                observer.error(new Error("Buffer overflow"));
              }
            }
            break;

          case "drop":
            if (buffer.length < bufferSize) {
              buffer.push(value);
              processBuffer();
            }
            break;

          case "dropOldest":
            buffer.push(value);
            if (buffer.length > bufferSize) {
              buffer.shift();
            }
            processBuffer();
            break;

          case "throttle": {
            const now = Date.now();
            if (now - lastEmitTime >= (config.interval || 100)) {
              observer.next(value);
              lastEmitTime = now;
            }
            break;
          }

          case "pause":
            if (buffer.length < bufferSize) {
              buffer.push(value);
              processBuffer();
            } else {
              paused = true;
            }
            break;
        }
      };

      const processBuffer = () => {
        if (buffer.length > 0 && !paused) {
          const value = buffer.shift()!;
          observer.next(value);

          if (config.strategy === "pause" && buffer.length < bufferSize / 2) {
            paused = false;
          }
        }
      };

      const cleanup = this.subscribe({
        next: handleValue,
        error: observer.error,
        complete: () => {
          while (buffer.length > 0) {
            observer.next(buffer.shift()!);
          }
          if (observer.complete) {
            observer.complete();
          }
        },
      }).unsubscribe;

      return () => {
        if (cleanup) cleanup();
      };
    });
  }

  /**
   * Transforms each value using the provided function
   */
  map<U>(fn: (value: T) => U): Stream<U> {
    return new Stream<U>((observer) => {
      return this.subscribe({
        next: (value) => observer.next(fn(value)),
        error: observer.error,
        complete: observer.complete,
      }).unsubscribe;
    });
  }

  /**
   * Transforms each value into a stream and flattens the result
   */
  flatMap<U>(fn: (value: T) => Stream<U>): Stream<U> {
    return new Stream<U>((observer) => {
      let completed = false;
      let activeStreams = 0;
      const subscriptions: Subscription[] = [];

      const checkComplete = () => {
        if (completed && activeStreams === 0 && observer.complete) {
          observer.complete();
        }
      };

      const mainSub = this.subscribe({
        next: (value) => {
          activeStreams++;
          const innerStream = fn(value);
          const innerSub = innerStream.subscribe({
            next: (innerValue) => observer.next(innerValue),
            error: observer.error,
            complete: () => {
              activeStreams--;
              checkComplete();
            },
          });
          subscriptions.push(innerSub);
        },
        error: observer.error,
        complete: () => {
          completed = true;
          checkComplete();
        },
      });

      return () => {
        mainSub.unsubscribe();
        subscriptions.forEach((sub) => sub.unsubscribe());
      };
    });
  }

  /**
   * Accumulates values using the provided function
   */
  scan<U>(fn: (acc: U, value: T) => U, initial: U): Stream<U> {
    return new Stream<U>((observer) => {
      let accumulator = initial;
      return this.subscribe({
        next: (value) => {
          accumulator = fn(accumulator, value);
          observer.next(accumulator);
        },
        error: observer.error,
        complete: observer.complete,
      }).unsubscribe;
    });
  }

  /**
   * Extracts a property from each object value
   */
  pluck<K extends keyof T>(key: K): Stream<T[K]> {
    return this.map((value) => value[key]);
  }

  /**
   * Filters values based on a predicate
   */
  filter(predicate: (value: T) => boolean): Stream<T> {
    return new Stream<T>((observer) => {
      return this.subscribe({
        next: (value) => {
          if (predicate(value)) {
            observer.next(value);
          }
        },
        error: observer.error,
        complete: observer.complete,
      }).unsubscribe;
    });
  }

  /**
   * Takes only the first n values
   */
  take(count: number): Stream<T> {
    return new Stream<T>((observer) => {
      let taken = 0;
      const subscription = this.subscribe({
        next: (value) => {
          if (taken < count) {
            observer.next(value);
            taken++;
            if (taken >= count) {
              if (observer.complete) observer.complete();
              subscription.unsubscribe();
            }
          }
        },
        error: observer.error,
        complete: observer.complete,
      });
      return subscription.unsubscribe;
    });
  }

  /**
   * Takes values while the predicate is true
   */
  takeWhile(predicate: (value: T) => boolean): Stream<T> {
    return new Stream<T>((observer) => {
      const subscription = this.subscribe({
        next: (value) => {
          if (predicate(value)) {
            observer.next(value);
          } else {
            if (observer.complete) observer.complete();
            subscription.unsubscribe();
          }
        },
        error: observer.error,
        complete: observer.complete,
      });
      return subscription.unsubscribe;
    });
  }

  /**
   * Skips the first n values
   */
  skip(count: number): Stream<T> {
    return new Stream<T>((observer) => {
      let skipped = 0;
      return this.subscribe({
        next: (value) => {
          if (skipped >= count) {
            observer.next(value);
          } else {
            skipped++;
          }
        },
        error: observer.error,
        complete: observer.complete,
      }).unsubscribe;
    });
  }

  /**
   * Skips values while the predicate is true
   */
  skipWhile(predicate: (value: T) => boolean): Stream<T> {
    return new Stream<T>((observer) => {
      let skipping = true;
      return this.subscribe({
        next: (value) => {
          if (skipping && !predicate(value)) {
            skipping = false;
          }
          if (!skipping) {
            observer.next(value);
          }
        },
        error: observer.error,
        complete: observer.complete,
      }).unsubscribe;
    });
  }

  /**
   * Emits only distinct values
   */
  distinct(keyFn?: (value: T) => unknown): Stream<T> {
    return new Stream<T>((observer) => {
      const seen = new Set<unknown>();
      return this.subscribe({
        next: (value) => {
          const key = keyFn ? keyFn(value) : value;
          if (!seen.has(key)) {
            seen.add(key);
            observer.next(value);
          }
        },
        error: observer.error,
        complete: observer.complete,
      }).unsubscribe;
    });
  }

  /**
   * Merges multiple streams concurrently
   */
  merge(...streams: Stream<T>[]): Stream<T> {
    return new Stream<T>((observer) => {
      const allStreams = [this, ...streams];
      const subscriptions: Subscription[] = [];
      let completedCount = 0;

      const checkComplete = () => {
        if (completedCount === allStreams.length && observer.complete) {
          observer.complete();
        }
      };

      for (const stream of allStreams) {
        const sub = stream.subscribe({
          next: (value) => observer.next(value),
          error: observer.error,
          complete: () => {
            completedCount++;
            checkComplete();
          },
        });
        subscriptions.push(sub);
      }

      return () => {
        subscriptions.forEach((sub) => sub.unsubscribe());
      };
    });
  }

  /**
   * Concatenates streams sequentially
   */
  concat(...streams: Stream<T>[]): Stream<T> {
    return new Stream<T>((observer) => {
      const allStreams = [this, ...streams];
      let currentIndex = 0;
      let currentSubscription: Subscription | null = null;

      const subscribeToNext = () => {
        if (currentIndex >= allStreams.length) {
          if (observer.complete) observer.complete();
          return;
        }

        const stream = allStreams[currentIndex];
        currentSubscription = stream.subscribe({
          next: (value) => observer.next(value),
          error: observer.error,
          complete: () => {
            currentIndex++;
            subscribeToNext();
          },
        });
      };

      subscribeToNext();

      return () => {
        if (currentSubscription) {
          currentSubscription.unsubscribe();
        }
      };
    });
  }

  /**
   * Combines values from two streams as tuples
   */
  zip<U>(other: Stream<U>): Stream<[T, U]> {
    return new Stream<[T, U]>((observer) => {
      const buffer1: T[] = [];
      const buffer2: U[] = [];
      let completed1 = false;
      let completed2 = false;

      const tryEmit = () => {
        while (buffer1.length > 0 && buffer2.length > 0) {
          observer.next([buffer1.shift()!, buffer2.shift()!]);
        }

        if (
          (completed1 && buffer1.length === 0) ||
          (completed2 && buffer2.length === 0)
        ) {
          if (observer.complete) observer.complete();
        }
      };

      const sub1 = this.subscribe({
        next: (value) => {
          buffer1.push(value);
          tryEmit();
        },
        error: observer.error,
        complete: () => {
          completed1 = true;
          tryEmit();
        },
      });

      const sub2 = other.subscribe({
        next: (value) => {
          buffer2.push(value);
          tryEmit();
        },
        error: observer.error,
        complete: () => {
          completed2 = true;
          tryEmit();
        },
      });

      return () => {
        sub1.unsubscribe();
        sub2.unsubscribe();
      };
    });
  }

  /**
   * Combines latest values from two streams
   */
  combineLatest<U>(other: Stream<U>): Stream<[T, U]> {
    return new Stream<[T, U]>((observer) => {
      let latestT: T | undefined;
      let latestU: U | undefined;
      let hasT = false;
      let hasU = false;
      let completed1 = false;
      let completed2 = false;

      const tryEmit = () => {
        if (hasT && hasU) {
          observer.next([latestT!, latestU!]);
        }
        if (completed1 && completed2 && observer.complete) {
          observer.complete();
        }
      };

      const sub1 = this.subscribe({
        next: (value) => {
          latestT = value;
          hasT = true;
          tryEmit();
        },
        error: observer.error,
        complete: () => {
          completed1 = true;
          tryEmit();
        },
      });

      const sub2 = other.subscribe({
        next: (value) => {
          latestU = value;
          hasU = true;
          tryEmit();
        },
        error: observer.error,
        complete: () => {
          completed2 = true;
          tryEmit();
        },
      });

      return () => {
        sub1.unsubscribe();
        sub2.unsubscribe();
      };
    });
  }

  /**
   * Performs side effects without modifying values
   */
  tap(fn: (value: T) => void): Stream<T> {
    return new Stream<T>((observer) => {
      return this.subscribe({
        next: (value) => {
          fn(value);
          observer.next(value);
        },
        error: observer.error,
        complete: observer.complete,
      }).unsubscribe;
    });
  }

  /**
   * Delays each value by the specified milliseconds
   */
  delay(ms: number): Stream<T> {
    return new Stream<T>((observer) => {
      const queue: T[] = [];
      let processing = false;
      let completed = false;

      const processQueue = async () => {
        if (processing || queue.length === 0) {
          if (completed && queue.length === 0 && observer.complete) {
            observer.complete();
          }
          return;
        }
        processing = true;
        const value = queue.shift()!;
        await new Promise((resolve) => setTimeout(resolve, ms));
        observer.next(value);
        processing = false;
        processQueue();
      };

      const subscription = this.subscribe({
        next: (value) => {
          queue.push(value);
          processQueue();
        },
        error: observer.error,
        complete: () => {
          completed = true;
          processQueue();
        },
      });

      return () => {
        subscription.unsubscribe();
      };
    });
  }

  /**
   * Retries the stream on error
   */
  retry(count: number = 3): Stream<T> {
    return new Stream<T>((observer) => {
      let attempts = 0;
      let currentSubscription: Subscription | null = null;

      const trySubscribe = () => {
        currentSubscription = this.subscribe({
          next: (value) => observer.next(value),
          error: (error) => {
            attempts++;
            if (attempts <= count) {
              if (currentSubscription) {
                currentSubscription.unsubscribe();
              }
              trySubscribe();
            } else {
              if (observer.error) observer.error(error);
            }
          },
          complete: observer.complete,
        });
      };

      trySubscribe();

      return () => {
        if (currentSubscription) {
          currentSubscription.unsubscribe();
        }
      };
    });
  }

  /**
   * Handles errors by switching to another stream
   */
  catchError(handler: (error: Error) => Stream<T>): Stream<T> {
    return new Stream<T>((observer) => {
      let fallbackSubscription: Subscription | null = null;

      const mainSubscription = this.subscribe({
        next: (value) => observer.next(value),
        error: (error) => {
          const fallbackStream = handler(error);
          fallbackSubscription = fallbackStream.subscribe({
            next: (value) => observer.next(value),
            error: observer.error,
            complete: observer.complete,
          });
        },
        complete: observer.complete,
      });

      return () => {
        mainSubscription.unsubscribe();
        if (fallbackSubscription) {
          fallbackSubscription.unsubscribe();
        }
      };
    });
  }
}

export { Stream };
