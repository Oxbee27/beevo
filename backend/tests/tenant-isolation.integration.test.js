import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { randomUUID } from "node:crypto";
import pool from "../src/config/database.js";

import { getBusinessWallet } from "../src/services/get-business-wallet.service.js";
import { listWalletTransactions } from "../src/services/list-wallet-transactions.service.js";
import { listStaff } from "../src/services/list-staff.service.js";
import { getStaff } from "../src/services/get-staff.service.js";
import { updateStaff } from "../src/services/update-staff.service.js";
import { updateStaffStatus } from "../src/services/update-staff-status.service.js";
import { listRoles } from "../src/services/list-roles.service.js";
import { updateRole } from "../src/services/update-role.service.js";
import { deleteRole } from "../src/services/delete-role.service.js";
import { getDashboardSummary } from "../src/services/get-dashboard-summary.service.js";
import {
  listBusinessConversations,
  getBusinessConversation,
} from "../src/services/list-business-conversations.service.js";
import {
  listPendingConversations,
  getPendingConversation,
} from "../src/services/pending-conversation-inbox.service.js";


import { listCustomers } from "../src/services/list-customers.service.js";
import { getCustomer } from "../src/services/get-customer.service.js";
import { updateCustomer } from "../src/services/update-customer.service.js";
import { deleteCustomer } from "../src/services/delete-customer.service.js";
import { createEnquiry } from "../src/services/create-enquiry.service.js";
import { listEnquiries } from "../src/services/list-enquiries.service.js";
import { getEnquiry } from "../src/services/get-enquiry.service.js";
import { updateEnquiry } from "../src/services/update-enquiry.service.js";
import { deleteEnquiry } from "../src/services/delete-enquiry.service.js";
import { createFollowUp } from "../src/services/create-follow-up.service.js";
import { listFollowUps } from "../src/services/list-follow-ups.service.js";
import { getFollowUp } from "../src/services/get-follow-up.service.js";
import { updateFollowUp } from "../src/services/update-follow-up.service.js";
import { deleteFollowUp } from "../src/services/delete-follow-up.service.js";
import {
  listProducts,
  getProduct,
  updateProduct,
  archiveProduct,
} from "../src/services/product.service.js";
import {
  createProductInterest,
  listProductInterests,
  updateProductInterest,
} from "../src/services/product-interest.service.js";

const enabled = process.env.BEEVO_RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!enabled)("Beevo tenant isolation integration", () => {
  let businessA;
  let businessB;
  let staffA;
  let staffB;
  let roleA;
  let roleB;
  let walletA;
  let walletB;
  let channelA;
  let channelB;
  let conversationA;
  let conversationB;
  let pendingConversationB;
  let messageB;
  let pendingMessageB;

  let customerA;
  let customerB;
  let enquiryA;
  let enquiryB;
  let followUpA;
  let followUpB;
  let productA;
  let productB;
  let interestB;
  let fixtureTag;

  beforeAll(async () => {
    if (
      process.env.DB_NAME !== "beevo_test" ||
      !["localhost", "127.0.0.1", "::1"].includes(
        (process.env.DB_HOST || "").toLowerCase()
      )
    ) {
      throw new Error(
        "Refusing to run: integration tests require the local beevo_test database."
      );
    }

    const connection = await pool.query(`
      SELECT current_database() AS database_name,
             host(inet_server_addr()) AS server_address
    `);

    if (
      connection.rows[0]?.database_name !== "beevo_test" ||
      ![null, "127.0.0.1", "::1"].includes(
        connection.rows[0]?.server_address
      )
    ) {
      throw new Error("Refusing to run against a non-local test database.");
    }

    fixtureTag = randomUUID();

    const a = await pool.query(
      `INSERT INTO businesses (name, email)
       VALUES ($1, $2)
       RETURNING id`,
      [`Tenant A ${fixtureTag}`, `tenant-a-${fixtureTag}@test.invalid`]
    );
    businessA = a.rows[0].id;

    const b = await pool.query(
      `INSERT INTO businesses (name, email)
       VALUES ($1, $2)
       RETURNING id`,
      [`Tenant B ${fixtureTag}`, `tenant-b-${fixtureTag}@test.invalid`]
    );
    businessB = b.rows[0].id;

    const users = await pool.query(
      `INSERT INTO users
         (business_id, name, email, password_hash, role)
       VALUES
         ($1, 'Tenant A Staff', $2, 'integration-test-hash', 'staff'),
         ($3, 'Tenant B Staff', $4, 'integration-test-hash', 'staff')
       RETURNING id, business_id`,
      [
        businessA,
        `staff-a-${fixtureTag}@test.invalid`,
        businessB,
        `staff-b-${fixtureTag}@test.invalid`,
      ]
    );

    staffA = users.rows.find((u) => Number(u.business_id) === Number(businessA)).id;
    staffB = users.rows.find((u) => Number(u.business_id) === Number(businessB)).id;

    const roles = await pool.query(
      `INSERT INTO roles (business_id, name, description)
       VALUES
         ($1, $2, 'Tenant A integration role'),
         ($3, $4, 'Tenant B integration role')
       RETURNING id, business_id`,
      [
        businessA,
        `Role A ${fixtureTag}`,
        businessB,
        `Role B ${fixtureTag}`,
      ]
    );

    roleA = roles.rows.find((r) => Number(r.business_id) === Number(businessA)).id;
    roleB = roles.rows.find((r) => Number(r.business_id) === Number(businessB)).id;

    const wallets = await pool.query(
      `INSERT INTO business_wallets (business_id, currency, balance_kobo)
       VALUES ($1, 'NGN', 0), ($2, 'NGN', 0)
       ON CONFLICT (business_id)
       DO UPDATE SET business_id = EXCLUDED.business_id
       RETURNING id, business_id`,
      [businessA, businessB]
    );

    walletA = wallets.rows.find((w) => Number(w.business_id) === Number(businessA)).id;
    walletB = wallets.rows.find((w) => Number(w.business_id) === Number(businessB)).id;

    const channels = await pool.query(
      `INSERT INTO business_communication_channels
         (business_id, channel, provider, connection_mode, address)
       VALUES
         ($1, 'whatsapp', 'dedicated', 'dedicated', $2),
         ($3, 'whatsapp', 'dedicated', 'dedicated', $4)
       RETURNING id, business_id`,
      [
        businessA,
        `tenant-a-${fixtureTag}`,
        businessB,
        `tenant-b-${fixtureTag}`,
      ]
    );

    channelA = channels.rows.find((c) => Number(c.business_id) === Number(businessA)).id;
    channelB = channels.rows.find((c) => Number(c.business_id) === Number(businessB)).id;

    const conversations = await pool.query(
      `INSERT INTO business_conversations
         (business_id, channel_connection_id, contact_identifier,
          classification_status, conversation_status)
       VALUES
         ($1, $2, $3, 'business', 'open'),
         ($4, $5, $6, 'business', 'open'),
         ($4, $5, $7, 'unclassified', 'open')
       RETURNING id, business_id, classification_status`,
      [
        businessA, channelA, `A-${fixtureTag}`,
        businessB, channelB, `B-${fixtureTag}`,
        `B-pending-${fixtureTag}`,
      ]
    );

    conversationA = conversations.rows.find(
      (c) => Number(c.business_id) === Number(businessA)
    ).id;

    conversationB = conversations.rows.find(
      (c) =>
        Number(c.business_id) === Number(businessB) &&
        c.classification_status === "business"
    ).id;

    pendingConversationB = conversations.rows.find(
      (c) => c.classification_status === "unclassified"
    ).id;

    const messages = await pool.query(
      `INSERT INTO conversation_messages
         (business_id, conversation_id, channel_connection_id,
          direction, message_type, body, delivery_status)
       VALUES ($1, $2, $3, 'inbound', 'text', $4, 'received')
       RETURNING id`,
      [
        businessB,
        conversationB,
        channelB,
        `Private message ${fixtureTag}`,
      ]
    );
    messageB = messages.rows[0].id;

    const pending = await pool.query(
      `INSERT INTO pending_conversation_messages
         (business_id, conversation_id, channel_connection_id,
          provider_message_id, message_type, body, received_at)
       VALUES ($1, $2, $3, $4, 'text', $5, NOW())
       RETURNING id`,
      [
        businessB,
        pendingConversationB,
        channelB,
        `provider-${fixtureTag}`,
        `Pending private message ${fixtureTag}`,
      ]
    );
    pendingMessageB = pending.rows[0].id;

    const customers = await pool.query(
      `INSERT INTO customers (business_id, name, email)
       VALUES ($1, $2, $3), ($4, $5, $6)
       RETURNING id, business_id`,
      [
        businessA, `Customer A ${fixtureTag}`, `customer-a-${fixtureTag}@test.invalid`,
        businessB, `Customer B ${fixtureTag}`, `customer-b-${fixtureTag}@test.invalid`,
      ]
    );
    customerA = customers.rows.find(
      c => Number(c.business_id) === Number(businessA)
    ).id;
    customerB = customers.rows.find(
      c => Number(c.business_id) === Number(businessB)
    ).id;

    const enquiries = await pool.query(
      `INSERT INTO enquiries (business_id, customer_id, created_by, subject)
       VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)
       RETURNING id, business_id`,
      [
        businessA, customerA, staffA, `Enquiry A ${fixtureTag}`,
        businessB, customerB, staffB, `Enquiry B ${fixtureTag}`,
      ]
    );
    enquiryA = enquiries.rows.find(
      e => Number(e.business_id) === Number(businessA)
    ).id;
    enquiryB = enquiries.rows.find(
      e => Number(e.business_id) === Number(businessB)
    ).id;

    const followUps = await pool.query(
      `INSERT INTO follow_ups (business_id, enquiry_id, assigned_to, note, due_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 day'),
              ($5, $6, $7, $8, NOW() + INTERVAL '1 day')
       RETURNING id, business_id`,
      [
        businessA, enquiryA, staffA, `Follow-up A ${fixtureTag}`,
        businessB, enquiryB, staffB, `Follow-up B ${fixtureTag}`,
      ]
    );
    followUpA = followUps.rows.find(
      f => Number(f.business_id) === Number(businessA)
    ).id;
    followUpB = followUps.rows.find(
      f => Number(f.business_id) === Number(businessB)
    ).id;

    const products = await pool.query(
      `INSERT INTO products (business_id, name, sku)
       VALUES ($1, $2, $3), ($4, $5, $6)
       RETURNING id, business_id`,
      [
        businessA, `Product A ${fixtureTag}`, `SKU-A-${fixtureTag}`,
        businessB, `Product B ${fixtureTag}`, `SKU-B-${fixtureTag}`,
      ]
    );
    productA = products.rows.find(
      p => Number(p.business_id) === Number(businessA)
    ).id;
    productB = products.rows.find(
      p => Number(p.business_id) === Number(businessB)
    ).id;

    const interest = await pool.query(
      `INSERT INTO product_interests
         (business_id, product_id, customer_id, enquiry_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [businessB, productB, customerB, enquiryB]
    );
    interestB = interest.rows[0].id;
  });

  afterAll(async () => {
    if (businessA && businessB) {
      // Delete only records belonging to these uniquely tagged test businesses.

      await pool.query(
        `DELETE FROM product_interests WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM follow_up_messages WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM follow_ups WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM enquiries WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM customer_communication_preferences WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM customers WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM products WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM pending_conversation_messages
         WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM conversation_messages
         WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM business_conversations
         WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM business_communication_channels
         WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM wallet_transactions
         WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM business_wallets
         WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM role_permissions
         WHERE role_id IN (
           SELECT id FROM roles WHERE business_id = ANY($1::bigint[])
         )`,
        [[businessA, businessB]]
      );
      await pool.query(
        `UPDATE users SET role_id = NULL
         WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM roles WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM users WHERE business_id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
      await pool.query(
        `DELETE FROM businesses WHERE id = ANY($1::bigint[])`,
        [[businessA, businessB]]
      );
    }

    await pool.end();
  });

  it("does not expose another business's wallet", async () => {
    const wallet = await getBusinessWallet(businessA);
    expect(Number(wallet.businessId)).toBe(Number(businessA));
    expect(Number(wallet.id)).toBe(Number(walletA));
    expect(Number(wallet.id)).not.toBe(Number(walletB));
  });

  it("does not expose another business's wallet transactions", async () => {
    const result = await listWalletTransactions(businessA);
    expect(result.transactions).toEqual([]);
  });

  it("does not list another business's staff", async () => {
    const staff = await listStaff(businessA);
    expect(staff.some((u) => Number(u.id) === Number(staffB))).toBe(false);
    expect(staff.every((u) => Number(u.business_id) === Number(businessA))).toBe(true);
  });

  it("does not retrieve another business's staff member", async () => {
    await expect(getStaff(businessA, staffB)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("does not update another business's staff member", async () => {
    await expect(
      updateStaff(businessA, staffB, { name: "Unauthorized update" })
    ).rejects.toMatchObject({ status: 404 });

    const result = await pool.query(
      `SELECT name FROM users WHERE id = $1 AND business_id = $2`,
      [staffB, businessB]
    );
    expect(result.rows[0].name).toBe("Tenant B Staff");
  });

  it("does not change another business's staff status", async () => {
    await expect(
      updateStaffStatus(businessA, staffB, false)
    ).rejects.toMatchObject({ status: 404 });

    const result = await pool.query(
      `SELECT is_active FROM users WHERE id = $1 AND business_id = $2`,
      [staffB, businessB]
    );
    expect(result.rows[0].is_active).toBe(true);
  });

  it("does not list another business's roles", async () => {
    const roles = await listRoles(businessA);
    expect(roles.some((r) => Number(r.id) === Number(roleB))).toBe(false);
    expect(roles.every((r) => Number(r.business_id) === Number(businessA))).toBe(true);
  });

  it("does not update another business's role", async () => {
    await expect(
      updateRole(businessA, roleB, { name: "Unauthorized role update" })
    ).rejects.toMatchObject({ status: 404 });

    const result = await pool.query(
      `SELECT name FROM roles WHERE id = $1 AND business_id = $2`,
      [roleB, businessB]
    );
    expect(result.rows[0].name).toBe(`Role B ${fixtureTag}`);
  });

  it("does not delete another business's role", async () => {
    await expect(deleteRole(businessA, roleB)).rejects.toMatchObject({
      status: 404,
    });

    const result = await pool.query(
      `SELECT id FROM roles WHERE id = $1 AND business_id = $2`,
      [roleB, businessB]
    );
    expect(result.rowCount).toBe(1);
  });

  it("does not include another business's records in dashboard totals", async () => {
    const summary = await getDashboardSummary(businessA);
    expect(summary.totalCustomers).toBe(1);
    expect(summary.totalEnquiries).toBe(1);
    expect(summary.pendingFollowUps).toBe(1);
  });

  it("does not list another business's conversations", async () => {
    const result = await listBusinessConversations(businessA);
    expect(
      result.conversations.some(
        (c) => Number(c.id) === Number(conversationB)
      )
    ).toBe(false);
    expect(
      result.conversations.every(
        (c) => Number(c.business_id) === Number(businessA)
      )
    ).toBe(true);
  });

  it("does not retrieve another business's conversation or messages", async () => {
    const result = await getBusinessConversation(businessA, conversationB);
    expect(result).toBeNull();
  });

  it("does not expose another business's pending conversations", async () => {
    const result = await listPendingConversations(businessA);
    expect(
      result.conversations.some(
        (c) => Number(c.id) === Number(pendingConversationB)
      )
    ).toBe(false);
  });

  it("does not retrieve another business's pending messages", async () => {
    const result = await getPendingConversation(
      businessA,
      pendingConversationB
    );
    expect(result).toBeNull();

    const message = await pool.query(
      `SELECT id FROM pending_conversation_messages
       WHERE id = $1 AND business_id = $2`,
      [pendingMessageB, businessB]
    );
    expect(message.rowCount).toBe(1);
  });

  it("keeps Business B's conversation messages unchanged", async () => {
    const result = await pool.query(
      `SELECT body FROM conversation_messages
       WHERE id = $1 AND business_id = $2`,
      [messageB, businessB]
    );
    expect(result.rows[0].body).toBe(`Private message ${fixtureTag}`);
  });

  it("keeps Business A's own conversation accessible", async () => {
    const result = await getBusinessConversation(businessA, conversationA);
    expect(result).not.toBeNull();
    expect(Number(result.conversation.business_id)).toBe(Number(businessA));
  });

  it("does not list or retrieve another business's customers", async () => {
    const customers = await listCustomers(businessA);
    expect(customers.some(c => Number(c.id) === Number(customerB))).toBe(false);
    expect(customers.every(c => Number(c.business_id) === Number(businessA))).toBe(true);
    expect(await getCustomer(businessA, customerB)).toBeNull();
  });

  it("does not update or delete another business's customer", async () => {
    expect(
      await updateCustomer(businessA, customerB, { name: "Unauthorized update" })
    ).toBeNull();
    expect(await deleteCustomer(businessA, customerB)).toBe(false);

    const result = await pool.query(
      "SELECT name FROM customers WHERE id = $1 AND business_id = $2",
      [customerB, businessB]
    );
    expect(result.rows[0].name).toBe(`Customer B ${fixtureTag}`);
  });

  it("does not create an enquiry using another business's customer", async () => {
    await expect(createEnquiry(businessA, staffA, {
      customerId: customerB,
      subject: "Unauthorized enquiry",
    })).rejects.toMatchObject({ status: 404 });
  });

  it("does not list or retrieve another business's enquiries", async () => {
    const enquiries = await listEnquiries(businessA);
    expect(enquiries.some(e => Number(e.id) === Number(enquiryB))).toBe(false);
    expect(enquiries.every(e => Number(e.business_id) === Number(businessA))).toBe(true);
    expect(await getEnquiry(businessA, enquiryB)).toBeNull();
  });

  it("does not update or delete another business's enquiry", async () => {
    expect(
      await updateEnquiry(businessA, enquiryB, { subject: "Unauthorized update" })
    ).toBeNull();
    expect(await deleteEnquiry(businessA, enquiryB)).toBe(false);

    const result = await pool.query(
      "SELECT subject FROM enquiries WHERE id = $1 AND business_id = $2",
      [enquiryB, businessB]
    );
    expect(result.rows[0].subject).toBe(`Enquiry B ${fixtureTag}`);
  });

  it("does not create a follow-up using another business's enquiry", async () => {
    await expect(createFollowUp(businessA, {
      enquiryId: enquiryB,
      assignedTo: staffA,
      note: "Unauthorized follow-up",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    })).rejects.toMatchObject({ status: 404 });
  });

  it("does not list or retrieve another business's follow-ups", async () => {
    const followUps = await listFollowUps(businessA);
    expect(followUps.some(f => Number(f.id) === Number(followUpB))).toBe(false);
    expect(followUps.every(f => Number(f.business_id) === Number(businessA))).toBe(true);
    expect(await getFollowUp(businessA, followUpB)).toBeNull();
  });

  it("does not update or delete another business's follow-up", async () => {
    expect(
      await updateFollowUp(businessA, followUpB, { note: "Unauthorized update" })
    ).toBeNull();
    expect(await deleteFollowUp(businessA, followUpB)).toBe(false);

    const result = await pool.query(
      "SELECT note FROM follow_ups WHERE id = $1 AND business_id = $2",
      [followUpB, businessB]
    );
    expect(result.rows[0].note).toBe(`Follow-up B ${fixtureTag}`);
  });

  it("does not list or retrieve another business's products", async () => {
    const products = await listProducts(businessA);
    expect(products.some(p => Number(p.id) === Number(productB))).toBe(false);
    expect(products.every(p => Number(p.business_id) === Number(businessA))).toBe(true);
    await expect(getProduct(businessA, productB)).rejects.toMatchObject({ status: 404 });
  });

  it("does not update or archive another business's product", async () => {
    await expect(
      updateProduct(businessA, productB, { name: "Unauthorized update" })
    ).rejects.toMatchObject({ status: 404 });
    await expect(archiveProduct(businessA, productB)).rejects.toMatchObject({ status: 404 });

    const result = await pool.query(
      "SELECT name, is_active FROM products WHERE id = $1 AND business_id = $2",
      [productB, businessB]
    );
    expect(result.rows[0].name).toBe(`Product B ${fixtureTag}`);
    expect(result.rows[0].is_active).toBe(true);
  });

  it("does not create a product interest for another business's product", async () => {
    await expect(createProductInterest(businessA, productB, {
      customerId: customerA,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("does not list or update another business's product interests", async () => {
    await expect(
      listProductInterests(businessA, productB)
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(
      updateProductInterest(businessA, productB, interestB, "notified")
    ).rejects.toMatchObject({ statusCode: 404 });

    const result = await pool.query(
      "SELECT status FROM product_interests WHERE id = $1 AND business_id = $2",
      [interestB, businessB]
    );
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].status).toBe("waiting");
  });

});
