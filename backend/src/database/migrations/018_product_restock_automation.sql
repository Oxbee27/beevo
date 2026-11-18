-- Beevo Product Restock Automation
-- Supports tenant-isolated inventory, customer interests, campaigns and queue messages.

-- 1. Products and inventory.
CREATE TABLE products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    sku VARCHAR(100),
    description TEXT,
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT products_business_id_id_unique UNIQUE (business_id, id)
);

CREATE UNIQUE INDEX products_business_sku_unique
ON products (business_id, LOWER(sku))
WHERE sku IS NOT NULL;

CREATE INDEX products_business_active_idx
ON products (business_id, is_active, name);

-- 2. Customers who want to be notified about a product.
CREATE TABLE product_interests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    enquiry_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'notified', 'cancelled', 'converted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT product_interests_business_id_id_unique
        UNIQUE (business_id, id),

    CONSTRAINT product_interests_product_fk
        FOREIGN KEY (business_id, product_id)
        REFERENCES products (business_id, id) ON DELETE CASCADE,

    CONSTRAINT product_interests_customer_fk
        FOREIGN KEY (business_id, customer_id)
        REFERENCES customers (business_id, id) ON DELETE CASCADE,

    CONSTRAINT product_interests_enquiry_fk
        FOREIGN KEY (business_id, enquiry_id, customer_id)
        REFERENCES enquiries (business_id, id, customer_id)
);

-- PostgreSQL 14-compatible handling of optional enquiry references.
CREATE OR REPLACE FUNCTION clear_product_interest_enquiry_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE product_interests
    SET enquiry_id = NULL
    WHERE business_id = OLD.business_id
      AND enquiry_id = OLD.id
      AND customer_id = OLD.customer_id;

    RETURN OLD;
END;
$$;

CREATE TRIGGER enquiries_clear_product_interest_reference
BEFORE DELETE ON enquiries
FOR EACH ROW
EXECUTE FUNCTION clear_product_interest_enquiry_reference();

CREATE UNIQUE INDEX product_interests_waiting_unique
ON product_interests (business_id, product_id, customer_id)
WHERE status = 'waiting';

CREATE INDEX product_interests_fifo_idx
ON product_interests (business_id, product_id, created_at, id)
WHERE status = 'waiting';

CREATE INDEX product_interests_customer_idx
ON product_interests (business_id, customer_id, status);

-- 3. Inventory restock events.
CREATE TABLE restock_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    previous_quantity INTEGER NOT NULL CHECK (previous_quantity >= 0),
    added_quantity INTEGER NOT NULL CHECK (added_quantity > 0),
    available_quantity INTEGER NOT NULL CHECK (available_quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT restock_events_business_id_id_unique
        UNIQUE (business_id, id),

    CONSTRAINT restock_events_product_fk
        FOREIGN KEY (business_id, product_id)
        REFERENCES products (business_id, id) ON DELETE CASCADE
);

CREATE INDEX restock_events_product_idx
ON restock_events (business_id, product_id, created_at DESC);

-- 4. Campaigns created from inventory restock events.
CREATE TABLE restock_campaigns (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    restock_event_id BIGINT NOT NULL,
    created_by BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft', 'queued', 'processing', 'paused',
            'completed', 'cancelled', 'failed'
        )),
    selection_mode VARCHAR(20) NOT NULL DEFAULT 'fifo'
        CHECK (selection_mode IN ('fifo', 'all', 'manual')),
    max_recipients INTEGER CHECK (max_recipients IS NULL OR max_recipients > 0),
    batch_size INTEGER NOT NULL DEFAULT 100
        CHECK (batch_size BETWEEN 1 AND 1000),
    stock_limit INTEGER NOT NULL CHECK (stock_limit > 0),
    processed_count INTEGER NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
    queued_count INTEGER NOT NULL DEFAULT 0 CHECK (queued_count >= 0),
    next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    CONSTRAINT restock_campaigns_business_id_id_unique
        UNIQUE (business_id, id),

    CONSTRAINT restock_campaigns_product_fk
        FOREIGN KEY (business_id, product_id)
        REFERENCES products (business_id, id) ON DELETE CASCADE,

    CONSTRAINT restock_campaigns_event_fk
        FOREIGN KEY (business_id, restock_event_id)
        REFERENCES restock_events (business_id, id) ON DELETE CASCADE,

    CONSTRAINT restock_campaigns_creator_fk
        FOREIGN KEY (business_id, created_by)
        REFERENCES users (business_id, id)
);

-- PostgreSQL 14-compatible handling of optional campaign creator references.
CREATE OR REPLACE FUNCTION clear_restock_campaign_creator_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE restock_campaigns
    SET created_by = NULL
    WHERE business_id = OLD.business_id
      AND created_by = OLD.id;

    RETURN OLD;
END;
$$;

CREATE TRIGGER users_clear_restock_campaign_creator
BEFORE DELETE ON users
FOR EACH ROW
EXECUTE FUNCTION clear_restock_campaign_creator_reference();

CREATE INDEX restock_campaigns_due_idx
ON restock_campaigns (next_run_at, id)
WHERE status IN ('queued', 'processing');

CREATE INDEX restock_campaigns_business_idx
ON restock_campaigns (business_id, created_at DESC);

-- 5. Campaign recipient records.
CREATE TABLE restock_campaign_recipients (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL,
    campaign_id BIGINT NOT NULL,
    interest_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('email', 'sms', 'whatsapp')),
    status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN (
            'queued', 'sending', 'sent', 'failed',
            'skipped', 'cancelled'
        )),
    skip_reason VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT restock_recipients_business_id_id_unique
        UNIQUE (business_id, id),

    CONSTRAINT restock_recipients_campaign_interest_channel_unique
        UNIQUE (business_id, campaign_id, interest_id, channel),

    CONSTRAINT restock_recipients_campaign_fk
        FOREIGN KEY (business_id, campaign_id)
        REFERENCES restock_campaigns (business_id, id) ON DELETE CASCADE,

    CONSTRAINT restock_recipients_interest_fk
        FOREIGN KEY (business_id, interest_id)
        REFERENCES product_interests (business_id, id) ON DELETE CASCADE,

    CONSTRAINT restock_recipients_customer_fk
        FOREIGN KEY (business_id, customer_id)
        REFERENCES customers (business_id, id) ON DELETE CASCADE
);

CREATE INDEX restock_recipients_queue_idx
ON restock_campaign_recipients (business_id, campaign_id, id)
WHERE status = 'queued';

-- 6. Extend the existing communication queue without weakening
-- the integrity requirements of ordinary follow-up messages.
ALTER TABLE follow_up_messages
    ADD COLUMN source_type VARCHAR(20) NOT NULL DEFAULT 'follow_up',
    ADD COLUMN restock_recipient_id BIGINT;

ALTER TABLE follow_up_messages
    ALTER COLUMN follow_up_id DROP NOT NULL,
    ALTER COLUMN enquiry_id DROP NOT NULL;

ALTER TABLE follow_up_messages
    ADD CONSTRAINT follow_up_messages_source_type_check
    CHECK (source_type IN ('follow_up', 'restock'));

ALTER TABLE follow_up_messages
    ADD CONSTRAINT follow_up_messages_source_integrity_check
    CHECK (
        (
            source_type = 'follow_up'
            AND follow_up_id IS NOT NULL
            AND enquiry_id IS NOT NULL
            AND restock_recipient_id IS NULL
        )
        OR
        (
            source_type = 'restock'
            AND follow_up_id IS NULL
            AND enquiry_id IS NULL
            AND restock_recipient_id IS NOT NULL
        )
    );

-- Restock messages still have a direct tenant-safe customer reference.
ALTER TABLE follow_up_messages
    ADD CONSTRAINT follow_up_messages_customer_business_fk
    FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id) ON DELETE CASCADE;

ALTER TABLE follow_up_messages
    ADD CONSTRAINT follow_up_messages_restock_recipient_fk
    FOREIGN KEY (business_id, restock_recipient_id)
    REFERENCES restock_campaign_recipients (business_id, id)
    ON DELETE RESTRICT;

CREATE INDEX follow_up_messages_restock_recipient_idx
ON follow_up_messages (business_id, restock_recipient_id)
WHERE restock_recipient_id IS NOT NULL;

CREATE INDEX follow_up_messages_source_queue_idx
ON follow_up_messages (source_type, status, scheduled_for, next_attempt_at, id);

-- 7. Product and restock permissions.
INSERT INTO permissions (code, description)
VALUES
    ('products.view', 'View business products and inventory'),
    ('products.create', 'Create business products'),
    ('products.edit', 'Edit products and inventory quantities'),
    ('products.delete', 'Delete business products'),
    ('restock.view', 'View customer product interests and restock campaigns'),
    ('restock.create', 'Register product interests and create restock campaigns'),
    ('restock.edit', 'Manage and control restock campaigns')
ON CONFLICT (code) DO NOTHING;
