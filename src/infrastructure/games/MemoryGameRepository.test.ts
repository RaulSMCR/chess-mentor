import { MemoryGameRepository } from "./MemoryGameRepository";
import { runGameRepositoryContractTests } from "./contract";

runGameRepositoryContractTests(
  "Memory isolated",
  () => new MemoryGameRepository(),
);
