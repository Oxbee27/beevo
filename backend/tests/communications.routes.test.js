import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("Communications route protection", () => {
  it.each([
    ["GET", "/communications/channels"],
    ["GET", "/communications/overview"],
    ["GET", "/communications/messages"],
    ["GET", "/communications/messages/1"],
    ["PATCH", "/communications/messages/1/cancel"],
    ["POST", "/communications/messages/1/retry"],
  ])("%s %s requires authentication", async (method, path) => {
    const response = await request(app)[method.toLowerCase()](path);

    expect(response.status).toBe(401);
  });
});
