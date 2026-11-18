import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("Beevo wallet route protection", () => {
  it.each([
    ["GET", "/wallet"],
    ["GET", "/wallet/transactions"],
  ])("%s %s requires authentication", async (method, path) => {
    const response = await request(app)[method.toLowerCase()](path);

    expect(response.status).toBe(401);
  });
});
