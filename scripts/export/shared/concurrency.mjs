export async function runWithConcurrency(items, limit, worker, progressStep = 50) {
  let next = 0;
  let done = 0;
  const errors = [];
  async function loop() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await worker(items[index], index);
      } catch (error) {
        errors.push({ index, error: error.message });
      } finally {
        done++;
        if (done % progressStep === 0 || done === items.length) {
          process.stdout.write(`\r  进度 ${done}/${items.length} (失败 ${errors.length})   `);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, loop));
  process.stdout.write("\n");
  return errors;
}
