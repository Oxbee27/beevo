import { describe, expect, it, vi } from "vitest";

import {
  exchangeMetaAuthorizationCode,
  verifyMetaWhatsAppAssets,
  subscribeMetaWhatsAppAppToWaba,
  registerMetaWhatsAppPhoneNumber,
} from "../src/services/meta-whatsapp-api.service.js";

const env = {
  META_APP_ID: "123456789012345",
  META_APP_SECRET: "test-meta-app-secret",
  META_GRAPH_API_VERSION: "v27.0",
};

function mockResponse(payload, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("Meta WhatsApp API service", () => {
  describe("exchangeMetaAuthorizationCode", () => {
    it("exchanges an authorization code without exposing the app secret in headers", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockResponse({
          access_token: "temporary-business-token",
          token_type: "bearer",
          expires_in: 3600,
        }),
      );

      const result = await exchangeMetaAuthorizationCode({
        code: "temporary-meta-code",
        fetchImpl,
        env,
      });

      expect(result).toEqual({
        accessToken: "temporary-business-token",
        tokenType: "bearer",
        expiresIn: 3600,
      });

      const [url, options] = fetchImpl.mock.calls[0];

      expect(String(url)).toContain(
        "/v27.0/oauth/access_token",
      );
      expect(url.searchParams.get("client_id")).toBe(env.META_APP_ID);
      expect(url.searchParams.get("client_secret")).toBe(
        env.META_APP_SECRET,
      );
      expect(url.searchParams.get("code")).toBe("temporary-meta-code");
      expect(options.headers).not.toHaveProperty("Authorization");
    });

    it("rejects an empty authorization code without making a request", async () => {
      const fetchImpl = vi.fn();

      await expect(
        exchangeMetaAuthorizationCode({
          code: "",
          fetchImpl,
          env,
        }),
      ).rejects.toThrow("authorization code");

      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects missing Meta credentials without making a request", async () => {
      const fetchImpl = vi.fn();

      await expect(
        exchangeMetaAuthorizationCode({
          code: "valid-code",
          fetchImpl,
          env: {},
        }),
      ).rejects.toThrow("not configured");

      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("does not return an access token when Meta rejects the code", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockResponse({
          error: { message: "Invalid authorization code" },
        }, false),
      );

      await expect(
        exchangeMetaAuthorizationCode({
          code: "invalid-code",
          fetchImpl,
          env,
        }),
      ).rejects.toThrow("Meta rejected");

    });
  });

  describe("verifyMetaWhatsAppAssets", () => {
    it("verifies the WABA and confirms the selected phone belongs to it", async () => {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(
          mockResponse({
            id: "111222333",
            name: "Example Business",
          }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            data: [{
              id: "444555666",
              display_phone_number: "+2348012345678",
              verified_name: "Example Store",
            }],
          }),
        );

      const result = await verifyMetaWhatsAppAssets({
        accessToken: "temporary-business-token",
        businessAccountId: "111222333",
        phoneNumberId: "444555666",
        fetchImpl,
        env,
      });

      expect(result).toEqual({
        businessAccountId: "111222333",
        businessAccountName: "Example Business",
        phoneNumberId: "444555666",
        displayNumber: "+2348012345678",
        verifiedName: "Example Store",
      });

      expect(fetchImpl).toHaveBeenCalledTimes(2);

      for (const [, options] of fetchImpl.mock.calls) {
        expect(options.headers.Authorization).toBe(
          "Bearer temporary-business-token",
        );
      }
    });

    it("rejects a phone number that does not belong to the WABA", async () => {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(
          mockResponse({ id: "111222333", name: "Example Business" }),
        )
        .mockResolvedValueOnce(
          mockResponse({
            data: [{
              id: "999999999",
              display_phone_number: "+2348012345678",
            }],
          }),
        );

      await expect(
        verifyMetaWhatsAppAssets({
          accessToken: "temporary-business-token",
          businessAccountId: "111222333",
          phoneNumberId: "444555666",
          fetchImpl,
          env,
        }),
      ).rejects.toThrow("does not belong");
    });

    it("rejects malformed Meta identifiers before making a request", async () => {
      const fetchImpl = vi.fn();

      await expect(
        verifyMetaWhatsAppAssets({
          accessToken: "temporary-business-token",
          businessAccountId: "invalid",
          phoneNumberId: "444555666",
          fetchImpl,
          env,
        }),
      ).rejects.toThrow("Business Account ID");

      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects a WABA response that does not match the requested account", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        mockResponse({ id: "999999999", name: "Different Business" }),
      );

      await expect(
        verifyMetaWhatsAppAssets({
          accessToken: "temporary-business-token",
          businessAccountId: "111222333",
          phoneNumberId: "444555666",
          fetchImpl,
          env,
        }),
      ).rejects.toThrow("could not be verified");

      expect(fetchImpl).toHaveBeenCalledOnce();
    });
  });
});

describe("Meta WhatsApp onboarding operations", () => {
  it("subscribes the app to the WABA", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ success: true }),
    );

    const result = await subscribeMetaWhatsAppAppToWaba({
      accessToken: "temporary-business-token",
      businessAccountId: "111222333",
      fetchImpl,
      env,
    });

    expect(result).toEqual({ subscribed: true });
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      "/v27.0/111222333/subscribed_apps",
    );
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer temporary-business-token",
    );
  });

  it("registers the phone number with the owner's PIN", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ success: true }),
    );

    const result = await registerMetaWhatsAppPhoneNumber({
      accessToken: "temporary-business-token",
      phoneNumberId: "444555666",
      pin: "123456",
      fetchImpl,
      env,
    });

    expect(result).toEqual({ registered: true });

    const [url, options] = fetchImpl.mock.calls[0];
    const body = new URLSearchParams(options.body);

    expect(String(url)).toContain("/v27.0/444555666/register");
    expect(options.method).toBe("POST");
    expect(body.get("messaging_product")).toBe("whatsapp");
    expect(body.get("pin")).toBe("123456");
  });

  it("rejects an invalid PIN without making a request", async () => {
    const fetchImpl = vi.fn();

    await expect(registerMetaWhatsAppPhoneNumber({
      accessToken: "temporary-business-token",
      phoneNumberId: "444555666",
      pin: "12345",
      fetchImpl,
      env,
    })).rejects.toThrow("exactly six digits");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric PIN without making a request", async () => {
    const fetchImpl = vi.fn();

    await expect(registerMetaWhatsAppPhoneNumber({
      accessToken: "temporary-business-token",
      phoneNumberId: "444555666",
      pin: "12A456",
      fetchImpl,
      env,
    })).rejects.toThrow("exactly six digits");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects registration when Meta returns an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ error: { message: "Registration rejected" } }, false),
    );

    await expect(registerMetaWhatsAppPhoneNumber({
      accessToken: "temporary-business-token",
      phoneNumberId: "444555666",
      pin: "123456",
      fetchImpl,
      env,
    })).rejects.toThrow("Meta rejected");
  });

  it("rejects subscription when Meta returns an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ error: { message: "Subscription rejected" } }, false),
    );

    await expect(subscribeMetaWhatsAppAppToWaba({
      accessToken: "temporary-business-token",
      businessAccountId: "111222333",
      fetchImpl,
      env,
    })).rejects.toThrow("Meta rejected");
  });
});
