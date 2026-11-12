import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("Beevo conversation routes", () => {
  it("requires authentication to list conversations", async () => {
    const response = await request(app).get("/conversations");
    expect(response.status).toBe(401);
  });

  it("requires authentication to view a conversation", async () => {
    const response = await request(app).get("/conversations/20");
    expect(response.status).toBe(401);
  });

  it("requires authentication to classify a conversation", async () => {
    const response = await request(app)
      .patch("/conversations/20/classification")
      .send({ classification: "business" });

    expect(response.status).toBe(401);
  });
});
