import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

// Extend Bun's expect with jest-dom matchers
import { expect } from "bun:test";
import * as matchers from "@testing-library/jest-dom/matchers";
expect.extend(matchers as Parameters<typeof expect.extend>[0]);

// Cleanup after each test
import { afterEach } from "bun:test";
import { cleanup } from "@testing-library/react";
afterEach(() => cleanup());
