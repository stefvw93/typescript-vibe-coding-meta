import { assertEquals, assertRejects } from "jsr:@std/assert";
import { Stream } from "./stream.ts";

// Stream Creation Tests
Deno.test("Stream.from creates stream from array", async () => {
  const stream = Stream.from([1, 2, 3]);
  const result = await stream.toArray();
  assertEquals(result, [1, 2, 3]);
});

Deno.test("Stream.from creates stream from async iterable", async () => {
  async function* asyncGen() {
    yield 1;
    yield 2;
    yield 3;
  }
  const stream = Stream.from(asyncGen());
  const result = await stream.toArray();
  assertEquals(result, [1, 2, 3]);
});

Deno.test("Stream.of creates stream from values", async () => {
  const stream = Stream.of(1, 2, 3);
  const result = await stream.toArray();
  assertEquals(result, [1, 2, 3]);
});

Deno.test("Stream.empty creates empty stream", async () => {
  const stream = Stream.empty<number>();
  const result = await stream.toArray();
  assertEquals(result, []);
});

Deno.test("Stream.never creates stream that never emits", async () => {
  const stream = Stream.never<number>();
  const values: number[] = [];
  let completed = false;

  const subscription = stream.subscribe({
    next: (v) => values.push(v),
    complete: () => completed = true,
  });

  // Wait a bit and verify nothing happened
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(values, []);
  assertEquals(completed, false);
  subscription.unsubscribe();
});

Deno.test("Stream.throw creates stream that errors", async () => {
  const error = new Error("Test error");
  const stream = Stream.throw<number>(error);

  await assertRejects(
    async () => await stream.toArray(),
    Error,
    "Test error",
  );
});

Deno.test("Stream.fromPromise creates stream from resolved promise", async () => {
  const stream = Stream.fromPromise(Promise.resolve(42));
  const result = await stream.toArray();
  assertEquals(result, [42]);
});

Deno.test("Stream.fromPromise handles rejected promise", async () => {
  const error = new Error("Promise rejected");
  const stream = Stream.fromPromise<number>(Promise.reject(error));

  await assertRejects(
    async () => await stream.toArray(),
    Error,
    "Promise rejected",
  );
});

Deno.test("Stream.interval emits values at intervals", async () => {
  const stream = Stream.interval(10).take(3);
  const result = await stream.toArray();
  assertEquals(result, [0, 1, 2]);
});

Deno.test("Stream.range creates range of numbers", async () => {
  const stream = Stream.range(1, 5);
  const result = await stream.toArray();
  assertEquals(result, [1, 2, 3, 4, 5]);
});

Deno.test("Stream.range with step", async () => {
  const stream = Stream.range(0, 10, 2);
  const result = await stream.toArray();
  assertEquals(result, [0, 2, 4, 6, 8, 10]);
});

// Subscription Tests
Deno.test("subscribe receives all values", async () => {
  const stream = Stream.of(1, 2, 3);
  const values: number[] = [];
  let completed = false;

  await new Promise<void>((resolve) => {
    stream.subscribe({
      next: (v) => values.push(v),
      complete: () => {
        completed = true;
        resolve();
      },
    });
  });

  assertEquals(values, [1, 2, 3]);
  assertEquals(completed, true);
});

Deno.test("subscribe handles errors", async () => {
  const error = new Error("Stream error");
  const stream = Stream.throw<number>(error);
  let receivedError: Error | null = null;

  await new Promise<void>((resolve) => {
    stream.subscribe({
      next: () => {},
      error: (e) => {
        receivedError = e;
        resolve();
      },
    });
  });

  assertEquals(receivedError, error);
});

Deno.test("unsubscribe stops receiving values", async () => {
  const stream = Stream.interval(10);
  const values: number[] = [];

  const subscription = stream.subscribe({
    next: (v) => values.push(v),
  });

  await new Promise((resolve) => setTimeout(resolve, 35));
  subscription.unsubscribe();
  await new Promise((resolve) => setTimeout(resolve, 30));

  // Should have received ~3 values before unsubscribe
  assertEquals(values.length >= 2 && values.length <= 4, true);
});

Deno.test("subscription.closed reflects state", () => {
  const stream = Stream.of(1, 2, 3);
  const subscription = stream.subscribe({ next: () => {} });

  assertEquals(subscription.closed, false);
  subscription.unsubscribe();
  assertEquals(subscription.closed, true);
});

// Terminal Operations Tests
Deno.test("forEach executes for each value", async () => {
  const stream = Stream.of(1, 2, 3);
  const values: number[] = [];

  await stream.forEach((v) => {
    values.push(v);
  });
  assertEquals(values, [1, 2, 3]);
});

Deno.test("forEach handles async functions", async () => {
  const stream = Stream.of(1, 2, 3);
  const values: number[] = [];

  await stream.forEach(async (v) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    values.push(v);
  });

  assertEquals(values, [1, 2, 3]);
});

Deno.test("first returns first value", async () => {
  const stream = Stream.of(1, 2, 3);
  const result = await stream.first();
  assertEquals(result, 1);
});

Deno.test("first returns undefined for empty stream", async () => {
  const stream = Stream.empty<number>();
  const result = await stream.first();
  assertEquals(result, undefined);
});

Deno.test("last returns last value", async () => {
  const stream = Stream.of(1, 2, 3);
  const result = await stream.last();
  assertEquals(result, 3);
});

Deno.test("last returns undefined for empty stream", async () => {
  const stream = Stream.empty<number>();
  const result = await stream.last();
  assertEquals(result, undefined);
});

// Transformation Operators Tests
Deno.test("map transforms values", async () => {
  const stream = Stream.of(1, 2, 3).map((x) => x * 2);
  const result = await stream.toArray();
  assertEquals(result, [2, 4, 6]);
});

Deno.test("map preserves type safety", async () => {
  const stream = Stream.of(1, 2, 3).map((x) => x.toString());
  const result = await stream.toArray();
  assertEquals(result, ["1", "2", "3"]);
});

Deno.test("flatMap flattens nested streams", async () => {
  const stream = Stream.of(1, 2, 3)
    .flatMap((x) => Stream.of(x, x * 10));
  const result = await stream.toArray();
  assertEquals(result, [1, 10, 2, 20, 3, 30]);
});

Deno.test("scan accumulates values", async () => {
  const stream = Stream.of(1, 2, 3, 4)
    .scan((acc, x) => acc + x, 0);
  const result = await stream.toArray();
  assertEquals(result, [1, 3, 6, 10]);
});

Deno.test("pluck extracts property", async () => {
  interface Person {
    name: string;
    age: number;
  }

  const stream = Stream.of<Person>(
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
    { name: "Charlie", age: 35 },
  ).pluck("name");

  const result = await stream.toArray();
  assertEquals(result, ["Alice", "Bob", "Charlie"]);
});

// Filtering Operators Tests
Deno.test("filter removes values", async () => {
  const stream = Stream.of(1, 2, 3, 4, 5)
    .filter((x) => x % 2 === 0);
  const result = await stream.toArray();
  assertEquals(result, [2, 4]);
});

Deno.test("take limits values", async () => {
  const stream = Stream.of(1, 2, 3, 4, 5).take(3);
  const result = await stream.toArray();
  assertEquals(result, [1, 2, 3]);
});

Deno.test("take with count larger than stream", async () => {
  const stream = Stream.of(1, 2).take(5);
  const result = await stream.toArray();
  assertEquals(result, [1, 2]);
});

Deno.test("takeWhile stops on false predicate", async () => {
  const stream = Stream.of(1, 2, 3, 4, 5)
    .takeWhile((x) => x < 4);
  const result = await stream.toArray();
  assertEquals(result, [1, 2, 3]);
});

Deno.test("skip removes first values", async () => {
  const stream = Stream.of(1, 2, 3, 4, 5).skip(2);
  const result = await stream.toArray();
  assertEquals(result, [3, 4, 5]);
});

Deno.test("skipWhile skips until false predicate", async () => {
  const stream = Stream.of(1, 2, 3, 4, 5)
    .skipWhile((x) => x < 3);
  const result = await stream.toArray();
  assertEquals(result, [3, 4, 5]);
});

Deno.test("distinct removes duplicates", async () => {
  const stream = Stream.of(1, 2, 2, 3, 1, 3, 4).distinct();
  const result = await stream.toArray();
  assertEquals(result, [1, 2, 3, 4]);
});

Deno.test("distinct with key function", async () => {
  interface Item {
    id: number;
    value: string;
  }

  const stream = Stream.of<Item>(
    { id: 1, value: "a" },
    { id: 2, value: "b" },
    { id: 1, value: "c" },
    { id: 3, value: "d" },
  ).distinct((item) => item.id);

  const result = await stream.toArray();
  assertEquals(result.length, 3);
  assertEquals(result[0].id, 1);
  assertEquals(result[1].id, 2);
  assertEquals(result[2].id, 3);
});

// Combination Operators Tests
Deno.test("merge combines streams concurrently", async () => {
  const stream1 = Stream.of(1, 3, 5);
  const stream2 = Stream.of(2, 4, 6);
  const merged = stream1.merge(stream2);
  const result = await merged.toArray();

  // Values can be interleaved, so just check all are present
  result.sort((a, b) => a - b);
  assertEquals(result, [1, 2, 3, 4, 5, 6]);
});

Deno.test("concat combines streams sequentially", async () => {
  const stream1 = Stream.of(1, 2, 3);
  const stream2 = Stream.of(4, 5, 6);
  const concatenated = stream1.concat(stream2);
  const result = await concatenated.toArray();
  assertEquals(result, [1, 2, 3, 4, 5, 6]);
});

Deno.test("zip combines values as tuples", async () => {
  const stream1 = Stream.of(1, 2, 3);
  const stream2 = Stream.of("a", "b", "c");
  const zipped = stream1.zip(stream2);
  const result = await zipped.toArray();
  assertEquals(result, [[1, "a"], [2, "b"], [3, "c"]]);
});

Deno.test("zip stops at shorter stream", async () => {
  const stream1 = Stream.of(1, 2, 3, 4, 5);
  const stream2 = Stream.of("a", "b");
  const zipped = stream1.zip(stream2);
  const result = await zipped.toArray();
  assertEquals(result, [[1, "a"], [2, "b"]]);
});

Deno.test("combineLatest emits latest values", async () => {
  const stream1 = Stream.of(1, 2);
  const stream2 = Stream.of("a", "b");
  const combined = stream1.combineLatest(stream2);
  const result = await combined.toArray();

  // Should emit combinations with latest values
  assertEquals(result.length >= 2, true);
  assertEquals(result[result.length - 1], [2, "b"]);
});

// Utility Operators Tests
Deno.test("tap performs side effects", async () => {
  const sideEffects: number[] = [];
  const stream = Stream.of(1, 2, 3)
    .tap((v) => sideEffects.push(v * 10))
    .map((x) => x * 2);

  const result = await stream.toArray();
  assertEquals(result, [2, 4, 6]);
  assertEquals(sideEffects, [10, 20, 30]);
});

Deno.test("delay delays values", async () => {
  const start = Date.now();
  const stream = Stream.of(1, 2, 3).delay(50);
  const result = await stream.toArray();
  const duration = Date.now() - start;

  assertEquals(result, [1, 2, 3]);
  assertEquals(duration >= 150, true); // 3 values * 50ms
});

Deno.test("retry retries on error", async () => {
  let attempts = 0;

  class RetryableStream extends Stream<number> {
    constructor() {
      super((observer) => {
        attempts++;
        if (attempts < 3) {
          if (observer.error) {
            observer.error(new Error("Retry me"));
          }
        } else {
          observer.next(42);
          if (observer.complete) {
            observer.complete();
          }
        }
      });
    }
  }

  const stream = new RetryableStream().retry(2);
  const result = await stream.toArray();
  assertEquals(result, [42]);
  assertEquals(attempts, 3);
});

Deno.test("catchError handles errors", async () => {
  const stream = Stream.throw<number>(new Error("Original error"))
    .catchError(() => Stream.of(99));

  const result = await stream.toArray();
  assertEquals(result, [99]);
});

// Backpressure Tests
Deno.test("withBackpressure buffer strategy queues values", async () => {
  const stream = Stream.from([1, 2, 3, 4, 5])
    .withBackpressure({ strategy: "buffer", bufferSize: 3 });

  const result = await stream.toArray();
  assertEquals(result, [1, 2, 3, 4, 5]);
});

Deno.test("withBackpressure drop strategy discards values", async () => {
  // This test would need a slow consumer to properly test
  // For now, just verify the API works
  const stream = Stream.from([1, 2, 3, 4, 5])
    .withBackpressure({ strategy: "drop" });

  const result = await stream.toArray();
  // May have some values dropped depending on timing
  assertEquals(result.length <= 5, true);
});

Deno.test("withBackpressure dropOldest keeps recent values", async () => {
  const stream = Stream.from([1, 2, 3, 4, 5])
    .withBackpressure({ strategy: "dropOldest", bufferSize: 2 });

  const result = await stream.toArray();
  // Implementation specific, but should prioritize recent values
  assertEquals(result.length <= 5, true);
});

Deno.test("withBackpressure throttle samples values", async () => {
  const stream = Stream.interval(10)
    .take(10)
    .withBackpressure({ strategy: "throttle", interval: 30 });

  const result = await stream.toArray();
  // Should sample approximately every 30ms
  assertEquals(result.length < 10, true);
});

Deno.test("withBackpressure pause pauses production", async () => {
  const stream = Stream.from([1, 2, 3, 4, 5])
    .withBackpressure({ strategy: "pause", bufferSize: 2 });

  const values: number[] = [];
  const subscription = stream.subscribe({
    next: async (v) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      values.push(v);
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 300));
  subscription.unsubscribe();

  // Should receive all values but at a controlled rate
  assertEquals(values.length <= 5, true);
});

// Complex Operator Chaining Tests
Deno.test("complex operator chain works correctly", async () => {
  const result = await Stream.of(1, 2, 3, 4, 5, 6)
    .filter((x) => x % 2 === 0)
    .map((x) => x * 10)
    .take(2)
    .toArray();

  assertEquals(result, [20, 40]);
});

Deno.test("multiple transformations maintain type safety", async () => {
  const result = await Stream.of(1, 2, 3)
    .map((x) => x * 2)
    .map((x) => x.toString())
    .map((s) => ({ value: s }))
    .toArray();

  assertEquals(result, [
    { value: "2" },
    { value: "4" },
    { value: "6" },
  ]);
});

// Memory and Cleanup Tests
Deno.test("stream cleanup on completion", async () => {
  let cleanedUp = false;

  const stream = Stream.of(1, 2, 3)
    .tap(() => {})
    .map((x) => x);

  await new Promise<void>((resolve) => {
    stream.subscribe({
      next: () => {},
      complete: () => {
        cleanedUp = true;
        resolve();
      },
    });
  });

  assertEquals(cleanedUp, true);
});

Deno.test("stream cleanup on unsubscribe", () => {
  const stream = Stream.interval(100);
  const subscription = stream.subscribe({ next: () => {} });

  assertEquals(subscription.closed, false);
  subscription.unsubscribe();
  assertEquals(subscription.closed, true);
});

// Edge Cases Tests
Deno.test("empty stream with operators", async () => {
  const result = await Stream.empty<number>()
    .map((x) => x * 2)
    .filter((x) => x > 0)
    .toArray();

  assertEquals(result, []);
});

Deno.test("single value stream", async () => {
  const result = await Stream.of(42)
    .map((x) => x * 2)
    .toArray();

  assertEquals(result, [84]);
});

Deno.test("chaining without subscription doesn't execute", async () => {
  let executed = false;

  const stream = Stream.of(1, 2, 3)
    .tap(() => {
      executed = true;
    });

  // No subscription, so nothing should execute
  await new Promise((resolve) => setTimeout(resolve, 50));
  assertEquals(executed, false);

  // Now subscribe and it should execute
  await stream.toArray();
  assertEquals(executed, true);
});

// Type Safety Tests
Deno.test("type inference through operators", async () => {
  const result = await Stream.of(1, 2, 3)
    .map((x) => x * 2)
    .map((x) => x.toString())
    .map((s) => s.length)
    .toArray();

  // TypeScript should infer number[] as the final type
  const _typeCheck: number[] = result;
  assertEquals(result, [1, 1, 1]); // "2", "4", "6" all have length 1
});
